package httptransport

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	profileapp "github.com/mackings/histora/apps/api-go/internal/app/profile"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type ProfileHandler struct{ service *profileapp.Service }

func NewProfileHandler(service *profileapp.Service) *ProfileHandler {
	return &ProfileHandler{service: service}
}

func (h *ProfileHandler) Me(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	result, err := h.service.Dashboard(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *ProfileHandler) Update(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input profileapp.UpdateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.Update(r.Context(), u.ID, input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *ProfileHandler) Sessions(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	result, err := h.service.Sessions(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"sessions": result})
}

func (h *ProfileHandler) RevokeSession(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "sessionId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Session not found"))
		return
	}
	session, err := h.service.RevokeSession(r.Context(), u.ID, id)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"session": session})
}

func (h *ProfileHandler) PushPublicKey(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, h.service.PushPublicKey())
}

func (h *ProfileHandler) ToggleFollow(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	result, err := h.service.ToggleFollow(r.Context(), u.ID, chi.URLParam(r, "username"))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *ProfileHandler) Devices(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	devices, err := h.service.Devices(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"devices": devices})
}

func (h *ProfileHandler) RenameDevice(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "deviceId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Device not found"))
		return
	}
	var input profileapp.DeviceRenameInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	device, err := h.service.RenameDevice(r.Context(), u.ID, id, input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"device": device})
}

func (h *ProfileHandler) RevokeDevice(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "deviceId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Device not found"))
		return
	}
	device, err := h.service.RevokeDevice(r.Context(), u.ID, id)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"device": device})
}

func (h *ProfileHandler) SavePushSubscription(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input profileapp.PushSubscriptionInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	if err := h.service.SavePushSubscription(r.Context(), u.ID, input, r.UserAgent()); err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ProfileHandler) DeletePushSubscription(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input profileapp.PushSubscriptionDeleteInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	if err := h.service.DeletePushSubscription(r.Context(), u.ID, input); err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *ProfileHandler) Invites(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	invites, err := h.service.Invites(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"invites": invites})
}

func (h *ProfileHandler) IncomingInvites(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	invites, err := h.service.IncomingInvites(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"invites": invites})
}

func (h *ProfileHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input profileapp.InviteInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	invite, err := h.service.CreateInvite(r.Context(), u.ID, input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"invite": invite})
}

func (h *ProfileHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "inviteId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Collaboration invite not found"))
		return
	}
	invite, err := h.service.AcceptInvite(r.Context(), u.ID, id)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"invite": invite})
}

func (h *ProfileHandler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "inviteId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Invite not found"))
		return
	}
	invite, err := h.service.RevokeInvite(r.Context(), u.ID, id)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"invite": invite})
}

func (h *ProfileHandler) Saved(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	stories, err := h.service.SavedStories(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"stories": stories})
}

func (h *ProfileHandler) RequestVerification(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	result, err := h.service.RequestVerification(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *ProfileHandler) Followers(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	people, err := h.service.Followers(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"followers": people})
}

func (h *ProfileHandler) Following(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	people, err := h.service.Following(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"following": people})
}

func (h *ProfileHandler) ToggleStoryAuthorFollow(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "storyId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Story not found"))
		return
	}
	result, err := h.service.ToggleStoryAuthorFollow(r.Context(), u.ID, id)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}
