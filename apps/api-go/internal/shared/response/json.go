package response

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
)

type errorPayload struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details any    `json:"details,omitempty"`
}

func JSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("failed to write json response", "error", err)
	}
}

func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

func Error(w http.ResponseWriter, err error) {
	var appErr apperror.Error
	if errors.As(err, &appErr) {
		JSON(w, appErr.Status, errorPayload{
			Error:   appErr.Message,
			Code:    appErr.Code,
			Details: appErr.Details,
		})
		return
	}

	slog.Error("unhandled request error", "error", err)
	JSON(w, http.StatusInternalServerError, errorPayload{Error: "Internal server error"})
}
