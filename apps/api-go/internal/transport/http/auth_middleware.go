package httptransport

import (
	"net/http"
	"strings"

	authapp "github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
)

func RequireAuth(authService *authapp.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenValue := bearerToken(r)
			if tokenValue == "" {
				response.Error(w, apperror.Unauthorized("Authentication required"))
				return
			}
			userID, sessionID, err := authService.VerifyAccessToken(tokenValue)
			if err != nil {
				response.Error(w, apperror.Unauthorized("Invalid or expired access token"))
				return
			}
			next.ServeHTTP(w, r.WithContext(appctx.WithAuthUser(r.Context(), appctx.AuthUser{ID: userID, SessionID: sessionID})))
		})
	}
}

func OptionalAuth(authService *authapp.Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenValue := bearerToken(r)
			if tokenValue == "" || authService == nil {
				next.ServeHTTP(w, r)
				return
			}
			userID, sessionID, err := authService.VerifyAccessToken(tokenValue)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r.WithContext(appctx.WithAuthUser(r.Context(), appctx.AuthUser{ID: userID, SessionID: sessionID})))
		})
	}
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
