package httptransport

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	statusapp "github.com/mackings/histora/apps/api-go/internal/app/status"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type StatusHandler struct {
	service *statusapp.Service
}

func NewStatusHandler(service *statusapp.Service) *StatusHandler {
	return &StatusHandler{service: service}
}

func (h *StatusHandler) Feed(w http.ResponseWriter, r *http.Request) {
	var userID *bson.ObjectID
	if authUser, ok := appctx.AuthUserFromContext(r.Context()); ok {
		userID = &authUser.ID
	}
	statuses, err := h.service.Feed(r.Context(), userID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, statuses)
}

func (h *StatusHandler) Mine(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	statuses, err := h.service.Mine(r.Context(), authUser.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, statuses)
}

func (h *StatusHandler) Share(w http.ResponseWriter, r *http.Request) {
	status, err := h.service.ByShareSlug(r.Context(), chi.URLParam(r, "shareSlug"))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, status)
}

func (h *StatusHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input statusapp.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	status, err := h.service.Create(r.Context(), authUser.ID, input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusCreated, status)
}

func (h *StatusHandler) Delete(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	statusID, err := bson.ObjectIDFromHex(chi.URLParam(r, "statusId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Status not found"))
		return
	}
	if err := h.service.Delete(r.Context(), statusID, authUser.ID); err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *StatusHandler) ToggleReaction(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	statusID, err := bson.ObjectIDFromHex(chi.URLParam(r, "statusId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Status not found"))
		return
	}
	var input struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.ToggleReaction(r.Context(), statusID, authUser.ID, input.Action)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}
