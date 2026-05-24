package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	authapp "github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/app/health"
	storyapp "github.com/mackings/histora/apps/api-go/internal/app/story"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/mackings/histora/apps/api-go/internal/platform/httpserver"
	mongoplatform "github.com/mackings/histora/apps/api-go/internal/platform/mongo"
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

	router := httptransport.NewRouter(httptransport.Deps{
		Config:       cfg,
		AuthService:  authapp.NewService(cfg, authapp.NewRepository(mongoStore.DB)),
		StoryService: storyapp.NewService(cfg, storyapp.NewRepository(mongoStore.DB)),
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
