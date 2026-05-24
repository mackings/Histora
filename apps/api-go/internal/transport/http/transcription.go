package httptransport

import (
	transcriptionapp "github.com/mackings/histora/apps/api-go/internal/app/transcription"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
	"io"
	"net/http"
)

type TranscriptionHandler struct{ service *transcriptionapp.Service }

func NewTranscriptionHandler(s *transcriptionapp.Service) *TranscriptionHandler {
	return &TranscriptionHandler{service: s}
}
func (h *TranscriptionHandler) Token(w http.ResponseWriter, r *http.Request) {
	out, err := h.service.Token(r.Context())
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
func (h *TranscriptionHandler) Create(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 26*1024*1024))
	if err != nil {
		response.Error(w, err)
		return
	}
	out, err := h.service.Transcribe(r.Context(), body, r.Header.Get("Content-Type"), r.URL.Query().Get("language"))
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, out)
}
