package httptransport

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/mackings/histora/apps/api-go/internal/app/health"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
)

type Deps struct {
	Config config.Config
	Health health.Service
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

	r.Route("/api", func(api chi.Router) {
		api.Get("/auth/me", notImplemented("auth/me"))
		api.Post("/auth/register", notImplemented("auth/register"))
		api.Post("/auth/login", notImplemented("auth/login"))
		api.Post("/auth/refresh", notImplemented("auth/refresh"))
		api.Post("/auth/logout", notImplemented("auth/logout"))
		api.Post("/auth/forgot-password", notImplemented("auth/forgot-password"))
		api.Post("/auth/reset-password", notImplemented("auth/reset-password"))
		api.Post("/auth/verify-email", notImplemented("auth/verify-email"))
		api.Post("/auth/resend-verification", notImplemented("auth/resend-verification"))
		api.Post("/auth/verify-device", notImplemented("auth/verify-device"))
		api.Post("/auth/resend-device-verification", notImplemented("auth/resend-device-verification"))

		api.Get("/stories/feed", notImplemented("stories/feed"))
		api.Get("/stories/mine", notImplemented("stories/mine"))
		api.Get("/stories/collaborative", notImplemented("stories/collaborative"))
		api.Get("/stories/mine/{storyId}", notImplemented("stories/mine/:storyId"))
		api.Get("/stories/public/{slug}", notImplemented("stories/public/:slug"))
		api.Post("/stories", notImplemented("stories/create"))
		api.Patch("/stories/{storyId}", notImplemented("stories/update"))
		api.Post("/stories/{storyId}/reactions", notImplemented("stories/reactions"))
		api.Post("/stories/{storyId}/share", notImplemented("stories/share"))

		api.Get("/statuses/mine", notImplemented("statuses/mine"))
		api.Get("/statuses/share/{shareSlug}", notImplemented("statuses/share/:shareSlug"))
		api.Get("/statuses", notImplemented("statuses/feed"))
		api.Post("/statuses", notImplemented("statuses/create"))
		api.Post("/statuses/{statusId}/reactions", notImplemented("statuses/reactions"))
		api.Delete("/statuses/{statusId}", notImplemented("statuses/delete"))

		api.Get("/comments", notImplemented("comments/list"))
		api.Post("/comments", notImplemented("comments/create"))

		api.Get("/anonymous-messages/inbox", notImplemented("anonymous/inbox"))
		api.Get("/anonymous-messages/sent", notImplemented("anonymous/sent"))
		api.Post("/anonymous-messages", notImplemented("anonymous/create"))
		api.Get("/anonymous-messages/{shareSlug}/private", notImplemented("anonymous/private"))
		api.Get("/anonymous-messages/{shareSlug}", notImplemented("anonymous/get"))
		api.Post("/anonymous-messages/{shareSlug}/help-requests", notImplemented("anonymous/help-request"))
		api.Patch("/anonymous-messages/{messageId}/distribution", notImplemented("anonymous/distribution"))
		api.Post("/anonymous-messages/{messageId}/help-requests/{requestId}/accept", notImplemented("anonymous/help-accept"))
		api.Post("/anonymous-messages/{messageId}/helper-contact/unlock", notImplemented("anonymous/helper-contact"))
		api.Delete("/anonymous-messages/{messageId}", notImplemented("anonymous/delete"))

		api.Get("/profile/me", notImplemented("profile/me"))
		api.Patch("/profile/me", notImplemented("profile/update"))
		api.Get("/profile/sessions", notImplemented("profile/sessions"))
		api.Post("/profile/sessions/{sessionId}/revoke", notImplemented("profile/revoke-session"))
		api.Get("/profile/devices", notImplemented("profile/devices"))
		api.Patch("/profile/devices/{deviceId}", notImplemented("profile/rename-device"))
		api.Post("/profile/devices/{deviceId}/revoke", notImplemented("profile/revoke-device"))
		api.Get("/profile/push/public-key", notImplemented("profile/push-key"))
		api.Post("/profile/push/subscriptions", notImplemented("profile/push-subscriptions"))
		api.Delete("/profile/push/subscriptions", notImplemented("profile/delete-push-subscriptions"))
		api.Get("/profile/invites", notImplemented("profile/invites"))
		api.Get("/profile/invites/incoming", notImplemented("profile/incoming-invites"))
		api.Post("/profile/invites", notImplemented("profile/create-invite"))
		api.Post("/profile/invites/{inviteId}/accept", notImplemented("profile/accept-invite"))
		api.Delete("/profile/invites/{inviteId}", notImplemented("profile/revoke-invite"))
		api.Get("/profile/saved", notImplemented("profile/saved"))
		api.Post("/profile/verification/request", notImplemented("profile/verification-request"))
		api.Get("/profile/followers", notImplemented("profile/followers"))
		api.Get("/profile/following", notImplemented("profile/following"))
		api.Post("/profile/follows/story/{storyId}/toggle", notImplemented("profile/follow-story-author"))
		api.Post("/profile/follows/{username}/toggle", notImplemented("profile/follow-user"))

		api.Post("/media/signed-upload", notImplemented("media/signed-upload"))
		api.Get("/media/signed-read", notImplemented("media/signed-read"))
		api.Post("/media/upload", notImplemented("media/upload"))

		api.Get("/transcriptions/token", notImplemented("transcriptions/token"))
		api.Post("/transcriptions", notImplemented("transcriptions"))
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
