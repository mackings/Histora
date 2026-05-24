package httptransport

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	mediaapp "github.com/mackings/histora/apps/api-go/internal/app/media"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
)

type MediaHandler struct {
	service *mediaapp.Service
}

func NewMediaHandler(service *mediaapp.Service) *MediaHandler {
	return &MediaHandler{service: service}
}

func (h *MediaHandler) SignedUpload(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input mediaapp.SignedUploadInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.SignedUpload(r.Context(), authUser.ID.Hex(), input)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *MediaHandler) SignedRead(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	result, err := h.service.SignedRead(r.Context(), authUser.ID.Hex(), r.URL.Query().Get("objectKey"))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}

func (h *MediaHandler) Upload(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 33*1024*1024))
	if err != nil {
		response.Error(w, err)
		return
	}
	contentType := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("contentType")))
	result, err := h.service.UploadDirect(r.Context(), authUser.ID.Hex(), r.URL.Query().Get("fileName"), contentType, body)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, result)
}
