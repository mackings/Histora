package httptransport

import (
	"encoding/json"
	"github.com/go-chi/chi/v5"
	anonymousapp "github.com/mackings/histora/apps/api-go/internal/app/anonymous"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
	"go.mongodb.org/mongo-driver/v2/bson"
	"net/http"
)

type AnonymousHandler struct{ service *anonymousapp.Service }

func NewAnonymousHandler(s *anonymousapp.Service) *AnonymousHandler {
	return &AnonymousHandler{service: s}
}
func (h *AnonymousHandler) Create(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var in anonymousapp.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	out, err := h.service.Create(r.Context(), u.ID, in)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, out)
}
func (h *AnonymousHandler) Inbox(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	out, err := h.service.Inbox(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
func (h *AnonymousHandler) Sent(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	out, err := h.service.Sent(r.Context(), u.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
func (h *AnonymousHandler) Get(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.GetBySlug(r.Context(), chi.URLParam(r, "shareSlug"))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
func (h *AnonymousHandler) Distribution(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "messageId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Anonymous message not found"))
		return
	}
	var in struct {
		Distribution string `json:"distribution"`
	}
	_ = json.NewDecoder(r.Body).Decode(&in)
	out, err := h.service.UpdateDistribution(r.Context(), u.ID, id, in.Distribution)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
func (h *AnonymousHandler) Help(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var in anonymousapp.HelpInput
	_ = json.NewDecoder(r.Body).Decode(&in)
	out, err := h.service.RequestHelp(r.Context(), u.ID, chi.URLParam(r, "shareSlug"), in)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
func (h *AnonymousHandler) Delete(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "messageId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Anonymous message not found"))
		return
	}
	if err := h.service.Delete(r.Context(), u.ID, id); err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *AnonymousHandler) AcceptHelp(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "messageId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Anonymous message not found"))
		return
	}
	out, err := h.service.AcceptHelp(r.Context(), u.ID, id, chi.URLParam(r, "requestId"))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}

func (h *AnonymousHandler) UnlockHelperContact(w http.ResponseWriter, r *http.Request) {
	u, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	id, err := bson.ObjectIDFromHex(chi.URLParam(r, "messageId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Anonymous message not found"))
		return
	}
	var in anonymousapp.UnlockInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	out, err := h.service.UnlockHelperContact(r.Context(), u.ID, id, in)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
