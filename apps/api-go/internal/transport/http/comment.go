package httptransport

import (
	"encoding/json"
	"net/http"

	commentapp "github.com/mackings/histora/apps/api-go/internal/app/comment"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
)

type CommentHandler struct {
	service *commentapp.Service
	events  EventPublisher
}

func NewCommentHandler(service *commentapp.Service, events EventPublisher) *CommentHandler {
	return &CommentHandler{service: service, events: events}
}

func (h *CommentHandler) List(w http.ResponseWriter, r *http.Request) {
	targetType := r.URL.Query().Get("targetType")
	targetID := r.URL.Query().Get("targetId")
	comments, err := h.service.List(r.Context(), targetType, targetID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, comments)
}

func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input commentapp.CreateInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	comment, err := h.service.Create(r.Context(), authUser.ID, input)
	if err != nil {
		response.Error(w, err)
		return
	}
	h.publishCommentCreated(r, comment)
	response.JSON(w, http.StatusCreated, comment)
}

func (h *CommentHandler) publishCommentCreated(r *http.Request, comment commentapp.Response) {
	if h.events == nil {
		return
	}
	channels := h.service.RealtimeChannels(r.Context(), comment)
	if len(channels) == 0 {
		return
	}
	payload := map[string]any{"kind": "comment.created", "comment": comment}
	seen := map[string]bool{}
	for _, channel := range channels {
		if channel == "" || seen[channel] {
			continue
		}
		seen[channel] = true
		h.events.Publish(r.Context(), channel, payload)
	}
}
