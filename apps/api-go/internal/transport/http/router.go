package httptransport

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
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
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
)

type Deps struct {
	Config               config.Config
	Health               health.Service
	AuthService          *authapp.Service
	StoryService         *storyapp.Service
	CommentService       *commentapp.Service
	StatusService        *statusapp.Service
	MediaService         *mediaapp.Service
	ProfileService       *profileapp.Service
	AnonymousService     *anonymousapp.Service
	TranscriptionService *transcriptionapp.Service
	EventsHandler        http.Handler
	EventsPublisher      EventPublisher
	TranscriptionRelay   http.Handler
}

type EventPublisher interface {
	Publish(context.Context, string, any)
}

func NewRouter(deps Deps) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(CORS(deps.Config))
	r.Use(Recoverer)
	r.Use(RequestLogger)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]any{"ok": true, "service": "Histora API", "runtime": "go"})
	})
	r.Head("/", func(w http.ResponseWriter, r *http.Request) {
		response.NoContent(w)
	})
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		status := deps.Health.Check(r.Context())
		httpStatus := http.StatusOK
		if !status.OK {
			httpStatus = http.StatusServiceUnavailable
		}
		response.JSON(w, httpStatus, status)
	})
	if deps.EventsHandler != nil {
		r.Handle("/ws/events", deps.EventsHandler)
	}
	if deps.TranscriptionRelay != nil {
		r.Handle("/ws/transcription", deps.TranscriptionRelay)
	}

	authHandler := NewAuthHandler(deps.Config, deps.AuthService)
	storyHandler := NewStoryHandler(deps.StoryService, deps.EventsPublisher)
	commentHandler := NewCommentHandler(deps.CommentService, deps.EventsPublisher)
	statusHandler := NewStatusHandler(deps.StatusService, deps.EventsPublisher)
	mediaHandler := NewMediaHandler(deps.MediaService)
	profileHandler := NewProfileHandler(deps.ProfileService)
	anonymousHandler := NewAnonymousHandler(deps.AnonymousService)
	transcriptionHandler := NewTranscriptionHandler(deps.TranscriptionService)
	requireAuth := RequireAuth(deps.AuthService)
	optionalAuth := OptionalAuth(deps.AuthService)

	r.Route("/api", func(api chi.Router) {
		api.Group(func(authRoutes chi.Router) {
			if deps.AuthService != nil {
				authRoutes.With(requireAuth).Get("/auth/me", authHandler.Me)
			} else {
				authRoutes.Get("/auth/me", notImplemented("auth/me"))
			}
			authRoutes.Post("/auth/register", authHandler.Register)
			authRoutes.Post("/auth/login", authHandler.Login)
			authRoutes.Post("/auth/refresh", authHandler.Refresh)
			authRoutes.Post("/auth/logout", authHandler.Logout)
			authRoutes.Post("/auth/forgot-password", authHandler.ForgotPassword)
			authRoutes.Post("/auth/reset-password", authHandler.ResetPassword)
			authRoutes.Post("/auth/verify-email", authHandler.VerifyEmail)
			authRoutes.Post("/auth/resend-verification", authHandler.ResendVerification)
			authRoutes.With(requireAuth).Post("/auth/ws-ticket", authHandler.WebSocketTicket)
		})
		api.Post("/auth/verify-device", authHandler.VerifyDevice)
		api.Post("/auth/resend-device-verification", authHandler.ResendDeviceVerification)

		if deps.StoryService != nil {
			api.With(optionalAuth).Get("/stories/feed", storyHandler.Feed)
			api.With(requireAuth).Get("/stories/mine", storyHandler.Mine)
			api.With(requireAuth).Get("/stories/collaborative", storyHandler.Collaborative)
			api.With(requireAuth).Get("/stories/mine/{storyId}", storyHandler.MineOne)
			api.With(optionalAuth).Get("/stories/public/{slug}", storyHandler.PublicBySlug)
		} else {
			api.Get("/stories/feed", notImplemented("stories/feed"))
			api.Get("/stories/mine", notImplemented("stories/mine"))
			api.Get("/stories/collaborative", notImplemented("stories/collaborative"))
			api.Get("/stories/mine/{storyId}", notImplemented("stories/mine/:storyId"))
			api.Get("/stories/public/{slug}", notImplemented("stories/public/:slug"))
		}
		if deps.StoryService != nil {
			api.With(requireAuth).Post("/stories", storyHandler.Create)
			api.With(requireAuth).Patch("/stories/{storyId}", storyHandler.Update)
		} else {
			api.Post("/stories", notImplemented("stories/create"))
			api.Patch("/stories/{storyId}", notImplemented("stories/update"))
		}
		if deps.StoryService != nil {
			api.With(requireAuth).Post("/stories/{storyId}/reactions", storyHandler.ToggleReaction)
			api.With(requireAuth).Post("/stories/{storyId}/share", storyHandler.Share)
		} else {
			api.Post("/stories/{storyId}/reactions", notImplemented("stories/reactions"))
			api.Post("/stories/{storyId}/share", notImplemented("stories/share"))
		}

		if deps.StatusService != nil {
			api.With(requireAuth).Get("/statuses/mine", statusHandler.Mine)
			api.Get("/statuses/share/{shareSlug}", statusHandler.Share)
			api.With(optionalAuth).Get("/statuses", statusHandler.Feed)
			api.With(requireAuth).Post("/statuses", statusHandler.Create)
			api.With(requireAuth).Post("/statuses/{statusId}/reactions", statusHandler.ToggleReaction)
			api.With(requireAuth).Delete("/statuses/{statusId}", statusHandler.Delete)
		} else {
			api.Get("/statuses/mine", notImplemented("statuses/mine"))
			api.Get("/statuses/share/{shareSlug}", notImplemented("statuses/share/:shareSlug"))
			api.Get("/statuses", notImplemented("statuses/feed"))
			api.Post("/statuses", notImplemented("statuses/create"))
			api.Post("/statuses/{statusId}/reactions", notImplemented("statuses/reactions"))
			api.Delete("/statuses/{statusId}", notImplemented("statuses/delete"))
		}

		if deps.CommentService != nil {
			api.With(optionalAuth).Get("/comments", commentHandler.List)
			api.With(requireAuth).Post("/comments", commentHandler.Create)
		} else {
			api.Get("/comments", notImplemented("comments/list"))
			api.Post("/comments", notImplemented("comments/create"))
		}

		if deps.AnonymousService != nil {
			api.With(requireAuth).Get("/anonymous-messages/inbox", anonymousHandler.Inbox)
			api.With(requireAuth).Get("/anonymous-messages/sent", anonymousHandler.Sent)
			api.With(requireAuth).Post("/anonymous-messages", anonymousHandler.Create)
			api.Get("/anonymous-messages/{shareSlug}/private", anonymousHandler.Get)
			api.Get("/anonymous-messages/{shareSlug}", anonymousHandler.Get)
			api.With(requireAuth).Post("/anonymous-messages/{shareSlug}/help-requests", anonymousHandler.Help)
			api.With(requireAuth).Post("/anonymous-messages/{messageId}/help-requests/{requestId}/accept", anonymousHandler.AcceptHelp)
			api.With(requireAuth).Post("/anonymous-messages/{messageId}/helper-contact/unlock", anonymousHandler.UnlockHelperContact)
			api.With(requireAuth).Patch("/anonymous-messages/{messageId}/distribution", anonymousHandler.Distribution)
			api.With(requireAuth).Delete("/anonymous-messages/{messageId}", anonymousHandler.Delete)
		} else {
			api.Get("/anonymous-messages/inbox", notImplemented("anonymous/inbox"))
			api.Get("/anonymous-messages/sent", notImplemented("anonymous/sent"))
			api.Post("/anonymous-messages", notImplemented("anonymous/create"))
			api.Get("/anonymous-messages/{shareSlug}/private", notImplemented("anonymous/private"))
			api.Get("/anonymous-messages/{shareSlug}", notImplemented("anonymous/get"))
			api.Post("/anonymous-messages/{shareSlug}/help-requests", notImplemented("anonymous/help-request"))
			api.Patch("/anonymous-messages/{messageId}/distribution", notImplemented("anonymous/distribution"))
			api.Delete("/anonymous-messages/{messageId}", notImplemented("anonymous/delete"))
		}

		if deps.ProfileService != nil {
			api.With(requireAuth).Get("/profile/me", profileHandler.Me)
			api.With(requireAuth).Patch("/profile/me", profileHandler.Update)
			api.With(requireAuth).Get("/profile/sessions", profileHandler.Sessions)
			api.With(requireAuth).Post("/profile/sessions/{sessionId}/revoke", profileHandler.RevokeSession)
			api.With(requireAuth).Get("/profile/devices", profileHandler.Devices)
			api.With(requireAuth).Patch("/profile/devices/{deviceId}", profileHandler.RenameDevice)
			api.With(requireAuth).Post("/profile/devices/{deviceId}/revoke", profileHandler.RevokeDevice)
			api.With(requireAuth).Get("/profile/push/public-key", profileHandler.PushPublicKey)
			api.With(requireAuth).Post("/profile/push/subscriptions", profileHandler.SavePushSubscription)
			api.With(requireAuth).Delete("/profile/push/subscriptions", profileHandler.DeletePushSubscription)
			api.With(requireAuth).Get("/profile/invites", profileHandler.Invites)
			api.With(requireAuth).Get("/profile/invites/incoming", profileHandler.IncomingInvites)
			api.With(requireAuth).Post("/profile/invites", profileHandler.CreateInvite)
			api.With(requireAuth).Post("/profile/invites/{inviteId}/accept", profileHandler.AcceptInvite)
			api.With(requireAuth).Delete("/profile/invites/{inviteId}", profileHandler.RevokeInvite)
			api.With(requireAuth).Get("/profile/saved", profileHandler.Saved)
			api.With(requireAuth).Post("/profile/verification/request", profileHandler.RequestVerification)
			api.With(requireAuth).Get("/profile/followers", profileHandler.Followers)
			api.With(requireAuth).Get("/profile/following", profileHandler.Following)
			api.With(requireAuth).Post("/profile/follows/story/{storyId}/toggle", profileHandler.ToggleStoryAuthorFollow)
			api.With(requireAuth).Post("/profile/follows/{username}/toggle", profileHandler.ToggleFollow)
		} else {
			api.Get("/profile/me", notImplemented("profile/me"))
			api.Patch("/profile/me", notImplemented("profile/update"))
			api.Get("/profile/sessions", notImplemented("profile/sessions"))
			api.Post("/profile/sessions/{sessionId}/revoke", notImplemented("profile/revoke-session"))
			api.Get("/profile/push/public-key", notImplemented("profile/push-key"))
			api.Post("/profile/follows/{username}/toggle", notImplemented("profile/follow-user"))
		}
		if deps.MediaService != nil {
			api.With(requireAuth).Post("/media/signed-upload", mediaHandler.SignedUpload)
			api.With(requireAuth).Get("/media/signed-read", mediaHandler.SignedRead)
			api.With(requireAuth).Post("/media/upload", mediaHandler.Upload)
		} else {
			api.Post("/media/signed-upload", notImplemented("media/signed-upload"))
			api.Get("/media/signed-read", notImplemented("media/signed-read"))
			api.Post("/media/upload", notImplemented("media/upload"))
		}

		if deps.TranscriptionService != nil {
			api.With(requireAuth).Get("/transcriptions/token", transcriptionHandler.Token)
			api.With(requireAuth).Post("/transcriptions", transcriptionHandler.Create)
		} else {
			api.Get("/transcriptions/token", notImplemented("transcriptions/token"))
			api.Post("/transcriptions", notImplemented("transcriptions"))
		}
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		response.Error(w, apperror.NotFound("Route not found"))
	})

	return r
}

func notImplemented(feature string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusNotImplemented, map[string]string{
			"error":   "Go API route is scaffolded but not ported yet.",
			"feature": feature,
		})
	}
}
