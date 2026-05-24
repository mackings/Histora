package httptransport

import (
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	authapp "github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
)

type AuthHandler struct {
	cfg     config.Config
	service *authapp.Service
}

func NewAuthHandler(cfg config.Config, service *authapp.Service) *AuthHandler {
	return &AuthHandler{cfg: cfg, service: service}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var input authapp.RegisterInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.Register(r.Context(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, result)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var input authapp.LoginInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.Login(r.Context(), input, requestContext(r))
	if err != nil {
		response.Error(w, err)
		return
	}
	h.writeAuthPayload(w, result)
}

func (h *AuthHandler) VerifyDevice(w http.ResponseWriter, r *http.Request) {
	var input authapp.VerifyDeviceInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.VerifyDevice(r.Context(), input, requestContext(r))
	if err != nil {
		response.Error(w, err)
		return
	}
	h.writeAuthPayload(w, result)
}

func (h *AuthHandler) ResendDeviceVerification(w http.ResponseWriter, r *http.Request) {
	var input authapp.ResendDeviceVerificationInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.ResendDeviceVerification(r.Context(), input, requestContext(r))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	result, err := h.service.Me(r.Context(), authUser.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	refreshToken := refreshTokenFromRequest(r, h.cfg.RefreshCookieName)
	result, err := h.service.Refresh(r.Context(), refreshToken, requestContext(r))
	if err != nil {
		response.Error(w, err)
		return
	}
	h.writeAuthPayload(w, result)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	_ = h.service.Logout(r.Context(), refreshTokenFromRequest(r, h.cfg.RefreshCookieName))
	http.SetCookie(w, h.expiredRefreshCookie())
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AuthHandler) WebSocketTicket(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok || authUser.SessionID == "" {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input struct {
		Scope string `json:"scope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	ticket, err := h.service.IssueWebSocketTicket(authUser.ID, authUser.SessionID, input.Scope)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, ticket)
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	var input authapp.VerifyEmailInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.VerifyEmail(r.Context(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var input authapp.EmailInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.ResendEmailVerification(r.Context(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	var input authapp.EmailInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.ForgotPassword(r.Context(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var input authapp.ResetPasswordInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.ResetPassword(r.Context(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *AuthHandler) writeAuthPayload(w http.ResponseWriter, payload *authapp.AuthPayload) {
	http.SetCookie(w, h.refreshCookie(payload.RefreshToken))
	response.JSON(w, http.StatusOK, payload)
}

func (h *AuthHandler) refreshCookie(value string) *http.Cookie {
	sameSite := http.SameSiteLaxMode
	if h.cfg.NodeEnv == "production" {
		sameSite = http.SameSiteNoneMode
	}
	return &http.Cookie{
		Name:     h.cfg.RefreshCookieName,
		Value:    value,
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   h.cfg.NodeEnv == "production",
		SameSite: sameSite,
		MaxAge:   h.cfg.RefreshTokenTTLDays * 24 * 60 * 60,
	}
}

func (h *AuthHandler) expiredRefreshCookie() *http.Cookie {
	cookie := h.refreshCookie("")
	cookie.MaxAge = -1
	cookie.Expires = time.Unix(0, 0)
	return cookie
}

func refreshTokenFromRequest(r *http.Request, cookieName string) string {
	if cookie, err := r.Cookie(cookieName); err == nil {
		return cookie.Value
	}
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	return body.RefreshToken
}

func requestContext(r *http.Request) authapp.RequestContext {
	ipAddress := r.Header.Get("X-Forwarded-For")
	if ipAddress == "" {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err == nil {
			ipAddress = host
		}
	}
	if strings.Contains(ipAddress, ",") {
		ipAddress = strings.TrimSpace(strings.Split(ipAddress, ",")[0])
	}
	return authapp.RequestContext{
		IPAddress: ipAddress,
		UserAgent: r.UserAgent(),
	}
}
