package httptransport

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	storyapp "github.com/mackings/histora/apps/api-go/internal/app/story"
	"github.com/mackings/histora/apps/api-go/internal/shared/appctx"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/response"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type StoryHandler struct {
	service *storyapp.Service
	events  EventPublisher
}

func (h *StoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	var input storyapp.SaveInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	story, err := h.service.Save(r.Context(), authUser.ID, input, nil)
	if err != nil {
		response.Error(w, err)
		return
	}
	h.publishStorySaved(r, authUser.ID.Hex(), "story.created", story)
	response.JSON(w, http.StatusCreated, story)
}

func (h *StoryHandler) Update(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	storyID, err := bson.ObjectIDFromHex(chi.URLParam(r, "storyId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Story not found"))
		return
	}
	var input storyapp.SaveInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	story, err := h.service.Save(r.Context(), authUser.ID, input, &storyID)
	if err != nil {
		response.Error(w, err)
		return
	}
	h.publishStorySaved(r, authUser.ID.Hex(), "story.updated", story)
	response.JSON(w, http.StatusOK, story)
}

func (h *StoryHandler) ToggleReaction(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	storyID, err := bson.ObjectIDFromHex(chi.URLParam(r, "storyId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Story not found"))
		return
	}
	var input struct {
		Action string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		response.Error(w, apperror.BadRequest("Invalid JSON payload"))
		return
	}
	result, err := h.service.ToggleReaction(r.Context(), storyID, authUser.ID, input.Action)
	if err != nil {
		response.Error(w, err)
		return
	}
	h.publishStoryReaction(r, authUser.ID.Hex(), result)
	response.JSON(w, http.StatusOK, result)
}

func (h *StoryHandler) Share(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	storyID, err := bson.ObjectIDFromHex(chi.URLParam(r, "storyId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Story not found"))
		return
	}
	result, err := h.service.TrackShare(r.Context(), storyID, authUser.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	h.publishStoryShare(r, authUser.ID.Hex(), result)
	response.JSON(w, http.StatusOK, result)
}

func NewStoryHandler(service *storyapp.Service, events EventPublisher) *StoryHandler {
	return &StoryHandler{service: service, events: events}
}

func (h *StoryHandler) Feed(w http.ResponseWriter, r *http.Request) {
	var viewerID *bson.ObjectID
	if authUser, ok := appctx.AuthUserFromContext(r.Context()); ok {
		viewerID = &authUser.ID
	}
	stories, err := h.service.Feed(r.Context(), viewerID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, stories)
}

func (h *StoryHandler) Mine(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	stories, err := h.service.Mine(r.Context(), authUser.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, stories)
}

func (h *StoryHandler) Collaborative(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	stories, err := h.service.Collaborative(r.Context(), authUser.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, stories)
}

func (h *StoryHandler) MineOne(w http.ResponseWriter, r *http.Request) {
	authUser, ok := appctx.AuthUserFromContext(r.Context())
	if !ok {
		response.Error(w, apperror.Unauthorized("Authentication required"))
		return
	}
	storyID, err := bson.ObjectIDFromHex(chi.URLParam(r, "storyId"))
	if err != nil {
		response.Error(w, apperror.NotFound("Story not found"))
		return
	}
	story, err := h.service.MineOne(r.Context(), storyID, authUser.ID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, story)
}

func (h *StoryHandler) PublicBySlug(w http.ResponseWriter, r *http.Request) {
	var viewerID *bson.ObjectID
	if authUser, ok := appctx.AuthUserFromContext(r.Context()); ok {
		viewerID = &authUser.ID
	}
	story, err := h.service.PublicBySlug(r.Context(), chi.URLParam(r, "slug"), viewerID)
	if err != nil {
		response.Error(w, err)
		return
	}
	response.JSON(w, http.StatusOK, story)
}

func (h *StoryHandler) publishStorySaved(r *http.Request, userID string, kind string, story storyapp.SerializedStory) {
	if h.events == nil {
		return
	}
	payload := map[string]any{"kind": kind, "story": story}
	h.events.Publish(r.Context(), "user:"+userID, payload)
	if story.Status == "published" && story.Visibility == "public" {
		h.events.Publish(r.Context(), "feed", payload)
	}
	if len(story.Collaborators) == 0 {
		return
	}
	collaborationPayload := map[string]any{
		"kind":              "story.collaboration.updated",
		"storyId":           story.ID,
		"revision":          story.CollaborationRevision,
		"updatedAt":         story.UpdatedAt,
		"updatedByName":     story.LastEditedByName,
		"updatedByUsername": story.LastEditedByUsername,
	}
	participantIDs := map[string]bool{userID: true}
	if story.AuthorID != "" {
		participantIDs[story.AuthorID] = true
	}
	for _, collaborator := range story.Collaborators {
		participantIDs[collaborator.UserID.Hex()] = true
	}
	for participantID := range participantIDs {
		h.events.Publish(r.Context(), "user:"+participantID, collaborationPayload)
	}
}

func (h *StoryHandler) publishStoryReaction(r *http.Request, userID string, result storyapp.ReactionResult) {
	if h.events == nil {
		return
	}
	payload := map[string]any{
		"kind":           "story.reaction.updated",
		"storyId":        result.StoryID,
		"action":         result.Action,
		"active":         result.Active,
		"likesCount":     result.LikesCount,
		"bookmarksCount": result.BookmarksCount,
		"reactionsCount": result.ReactionsCount,
		"status":         result.Status,
		"visibility":     result.Visibility,
	}
	if result.Status == "published" && result.Visibility == "public" {
		h.events.Publish(r.Context(), "feed", payload)
	}
	h.events.Publish(r.Context(), "user:"+userID, payload)
}

func (h *StoryHandler) publishStoryShare(r *http.Request, userID string, result map[string]any) {
	if h.events == nil {
		return
	}
	payload := map[string]any{"kind": "story.share.updated"}
	for key, value := range result {
		payload[key] = value
	}
	if result["status"] == "published" && result["visibility"] == "public" {
		h.events.Publish(r.Context(), "feed", payload)
	}
	h.events.Publish(r.Context(), "user:"+userID, payload)
}
