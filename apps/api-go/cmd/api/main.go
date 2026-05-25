package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	anonymousapp "github.com/mackings/histora/apps/api-go/internal/app/anonymous"
	authapp "github.com/mackings/histora/apps/api-go/internal/app/auth"
	commentapp "github.com/mackings/histora/apps/api-go/internal/app/comment"
	"github.com/mackings/histora/apps/api-go/internal/app/health"
	mediaapp "github.com/mackings/histora/apps/api-go/internal/app/media"
	profileapp "github.com/mackings/histora/apps/api-go/internal/app/profile"
	statusapp "github.com/mackings/histora/apps/api-go/internal/app/status"
	storyapp "github.com/mackings/histora/apps/api-go/internal/app/story"
	transcriptionapp "github.com/mackings/histora/apps/api-go/internal/app/transcription"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/mackings/histora/apps/api-go/internal/platform/httpserver"
	"github.com/mackings/histora/apps/api-go/internal/platform/jobs"
	mongoplatform "github.com/mackings/histora/apps/api-go/internal/platform/mongo"
	"github.com/mackings/histora/apps/api-go/internal/platform/realtime"
	redisplatform "github.com/mackings/histora/apps/api-go/internal/platform/redis"
	httptransport "github.com/mackings/histora/apps/api-go/internal/transport/http"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	mongoStore, err := mongoplatform.Connect(ctx, cfg)
	if err != nil {
		slog.Error("failed to connect mongo", "error", err)
		os.Exit(1)
	}
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := mongoStore.Disconnect(shutdownCtx); err != nil {
			slog.Error("failed to disconnect mongo", "error", err)
		}
	}()
	redisClients, err := redisplatform.Connect(ctx, cfg)
	if err != nil {
		slog.Warn("redis unavailable; continuing without redis", "error", err)
		redisClients = &redisplatform.Clients{}
	}
	defer func() {
		if err := redisClients.Close(); err != nil {
			slog.Error("failed to close redis", "error", err)
		}
	}()
	counterReconciler := jobs.NewCounterReconciler(mongoStore.DB)
	jobs.NewQueue(redisClients.Command).RunCounterWorker(ctx, counterReconciler.Reconcile)

	authService := authapp.NewService(cfg, authapp.NewRepository(mongoStore.DB))
	eventsHub := realtime.NewHub(cfg, authService, redisClients.Command, redisClients.Subscribe, mongoStore.DB)
	router := httptransport.NewRouter(httptransport.Deps{
		Config:               cfg,
		AuthService:          authService,
		StoryService:         storyapp.NewService(cfg, storyapp.NewRepository(mongoStore.DB)),
		CommentService:       commentapp.NewService(cfg, commentapp.NewRepository(mongoStore.DB)),
		StatusService:        statusapp.NewService(cfg, statusapp.NewRepository(mongoStore.DB)),
		MediaService:         mediaapp.NewService(cfg),
		ProfileService:       profileapp.NewService(cfg, mongoStore.DB),
		AnonymousService:     anonymousapp.NewService(cfg, mongoStore.DB),
		TranscriptionService: transcriptionapp.NewService(cfg),
		EventsHandler:        eventsHub,
		EventsPublisher:      eventsHub,
		TranscriptionRelay:   realtime.NewTranscriptionRelay(cfg, authService),
		Health: health.Service{
			Mongo: mongoStore.Client,
			Redis: redisClients.Command,
		},
	})

	server := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       20 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	if err := httpserver.Run(ctx, server); err != nil {
		slog.Error("server stopped with error", "error", err)
		os.Exit(1)
	}
}
