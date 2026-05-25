package story

import (
	"context"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/mackings/histora/apps/api-go/internal/config"
	storydomain "github.com/mackings/histora/apps/api-go/internal/domain/story"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/cryptoutil"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type Service struct {
	cfg  config.Config
	repo *Repository
}

type SaveInput struct {
	Title            string             `json:"title"`
	Summary          string             `json:"summary"`
	CoverImageURL    string             `json:"coverImageUrl,omitempty"`
	Visibility       string             `json:"visibility"`
	Anonymous        bool               `json:"anonymous"`
	AllowedViewerIDs []string           `json:"allowedViewerIds"`
	Tags             []string           `json:"tags"`
	Links            []StoryLinkContent `json:"links"`
	Status           string             `json:"status"`
	ExpectedRevision *int               `json:"expectedRevision,omitempty"`
	Chapters         []ChapterInput     `json:"chapters"`
}

type ChapterInput struct {
	ID           string        `json:"id,omitempty"`
	Title        string        `json:"title"`
	Body         string        `json:"body"`
	Type         string        `json:"type"`
	Order        int           `json:"order"`
	ImageURLs    []string      `json:"imageUrls"`
	VoiceNoteURL string        `json:"voiceNoteUrl,omitempty"`
	Moments      []MomentInput `json:"moments"`
}

type MomentInput struct {
	ID           string   `json:"id,omitempty"`
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	HappenedAt   string   `json:"happenedAt"`
	ImageURLs    []string `json:"imageUrls"`
	VoiceNoteURL string   `json:"voiceNoteUrl,omitempty"`
}

type StoryTextContent struct {
	Title    string             `json:"title"`
	Summary  string             `json:"summary"`
	Tags     []string           `json:"tags"`
	Links    []StoryLinkContent `json:"links"`
	Chapters []ChapterContent   `json:"chapters"`
}

type StoryLinkContent struct {
	Label string `json:"label"`
	URL   string `json:"url"`
	Kind  string `json:"kind"`
}

type ChapterContent struct {
	Title   string          `json:"title"`
	Body    string          `json:"body"`
	Moments []MomentContent `json:"moments"`
}

type MomentContent struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}

type SerializedStory struct {
	ID                    string                     `json:"id"`
	Slug                  string                     `json:"slug"`
	Status                string                     `json:"status"`
	Title                 string                     `json:"title"`
	Summary               string                     `json:"summary"`
	CoverImageURL         string                     `json:"coverImageUrl,omitempty"`
	CoverImageKey         string                     `json:"coverImageKey,omitempty"`
	Visibility            string                     `json:"visibility"`
	Anonymous             bool                       `json:"anonymous"`
	AuthorName            string                     `json:"authorName"`
	AuthorUsername        string                     `json:"authorUsername"`
	AuthorID              string                     `json:"-"`
	IsOwner               bool                       `json:"isOwner"`
	CanEdit               bool                       `json:"canEdit"`
	Collaborative         bool                       `json:"collaborative"`
	CollaborationRevision int                        `json:"collaborationRevision"`
	Collaborators         []storydomain.Collaborator `json:"collaborators"`
	LastEditedByName      string                     `json:"lastEditedByName,omitempty"`
	LastEditedByUsername  string                     `json:"lastEditedByUsername,omitempty"`
	LastEditedAt          any                        `json:"lastEditedAt,omitempty"`
	AuthorVerified        bool                       `json:"authorVerified"`
	Following             bool                       `json:"following"`
	Tags                  []string                   `json:"tags"`
	Links                 []StoryLinkContent         `json:"links"`
	ReadCount             int64                      `json:"readCount"`
	ReactionsCount        int64                      `json:"reactionsCount"`
	LikesCount            int64                      `json:"likesCount"`
	BookmarksCount        int64                      `json:"bookmarksCount"`
	SharesCount           int64                      `json:"sharesCount"`
	CommentsCount         int64                      `json:"commentsCount"`
	ChapterCount          int                        `json:"chapterCount"`
	CommentCount          int64                      `json:"commentCount"`
	Liked                 bool                       `json:"liked"`
	Bookmarked            bool                       `json:"bookmarked"`
	Chapters              []SerializedChapter        `json:"chapters"`
	CreatedAt             any                        `json:"createdAt"`
	UpdatedAt             any                        `json:"updatedAt"`
}

type SerializedChapter struct {
	ID                   string             `json:"id,omitempty"`
	Title                string             `json:"title"`
	Body                 string             `json:"body"`
	Type                 string             `json:"type"`
	Order                int                `json:"order"`
	CreatedByName        string             `json:"createdByName,omitempty"`
	CreatedByUsername    string             `json:"createdByUsername,omitempty"`
	CreatedAt            any                `json:"createdAt,omitempty"`
	LastEditedByName     string             `json:"lastEditedByName,omitempty"`
	LastEditedByUsername string             `json:"lastEditedByUsername,omitempty"`
	LastEditedAt         any                `json:"lastEditedAt,omitempty"`
	ImageURLs            []string           `json:"imageUrls"`
	ImageKeys            []string           `json:"imageKeys"`
	VoiceNoteURL         string             `json:"voiceNoteUrl,omitempty"`
	VoiceNoteKey         string             `json:"voiceNoteKey,omitempty"`
	Moments              []SerializedMoment `json:"moments"`
}

type SerializedMoment struct {
	ID                   string   `json:"id,omitempty"`
	Title                string   `json:"title"`
	Description          string   `json:"description"`
	HappenedAt           any      `json:"happenedAt"`
	CreatedByName        string   `json:"createdByName,omitempty"`
	CreatedByUsername    string   `json:"createdByUsername,omitempty"`
	CreatedAt            any      `json:"createdAt,omitempty"`
	LastEditedByName     string   `json:"lastEditedByName,omitempty"`
	LastEditedByUsername string   `json:"lastEditedByUsername,omitempty"`
	LastEditedAt         any      `json:"lastEditedAt,omitempty"`
	ImageURLs            []string `json:"imageUrls"`
	ImageKeys            []string `json:"imageKeys"`
	VoiceNoteURL         string   `json:"voiceNoteUrl,omitempty"`
	VoiceNoteKey         string   `json:"voiceNoteKey,omitempty"`
}

func NewService(cfg config.Config, repo *Repository) *Service {
	return &Service{cfg: cfg, repo: repo}
}

func (s *Service) Save(ctx context.Context, authorID bson.ObjectID, input SaveInput, storyID *bson.ObjectID) (SerializedStory, error) {
	actor, err := s.repo.FindUserByID(ctx, authorID)
	if err != nil {
		return SerializedStory{}, err
	}
	if actor == nil {
		return SerializedStory{}, apperror.NotFound("User not found")
	}
	if err := validateSaveInput(input); err != nil {
		return SerializedStory{}, err
	}
	if actor.SubscriptionTier != "premium" && exceedsFreeLimits(input) {
		return SerializedStory{}, apperror.Forbidden("Free accounts can save up to 2 images, 1 voice note, and 2 chapters per story.")
	}
	var existing *storydomain.Story
	if storyID != nil {
		existing, err = s.repo.FindEditableByID(ctx, *storyID, authorID)
		if err != nil {
			return SerializedStory{}, err
		}
		if existing == nil {
			return SerializedStory{}, apperror.NotFound("Story not found")
		}
		if input.ExpectedRevision != nil && isCollaborativeStory(*existing) && *input.ExpectedRevision != existing.CollaborationRevision {
			return SerializedStory{}, apperror.Conflict(
				"A newer collaborative version is available. Load the latest version before saving again.",
				"STORY_REVISION_CONFLICT",
				map[string]int{"latestRevision": existing.CollaborationRevision},
			)
		}
	}
	slug, err := s.uniqueSlug(ctx, input.Title, storyID)
	if err != nil {
		return SerializedStory{}, err
	}
	now := time.Now()
	textContent := StoryTextContent{
		Title:    input.Title,
		Summary:  input.Summary,
		Tags:     input.Tags,
		Links:    input.Links,
		Chapters: make([]ChapterContent, 0, len(input.Chapters)),
	}
	chapters := make([]storydomain.Chapter, 0, len(input.Chapters))
	for index, chapter := range input.Chapters {
		textContent.Chapters = append(textContent.Chapters, ChapterContent{
			Title:   chapter.Title,
			Body:    chapter.Body,
			Moments: momentTextContent(chapter.Moments),
		})
		chapters = append(chapters, s.storedChapter(chapter, existing, index, actor.FullName, actor.Username, now))
	}
	contentEncrypted, err := cryptoutil.EncryptJSON(s.cfg.DataEncryptionKey, textContent)
	if err != nil {
		return SerializedStory{}, err
	}
	allowedViewerIDs := parseObjectIDs(input.AllowedViewerIDs)
	status := input.Status
	if status != "published" {
		status = "draft"
	}
	visibility := input.Visibility
	if visibility == "" {
		visibility = "private"
	}
	if existing != nil && existing.AuthorID != authorID {
		visibility = existing.Visibility
		input.Anonymous = existing.Anonymous
		allowedViewerIDs = existing.AllowedViewerIDs
	}
	stored := storydomain.Story{
		Slug:                 slug,
		Status:               status,
		Title:                cryptoutil.EncryptedContentPlaceholder,
		Summary:              cryptoutil.EncryptedContentPlaceholder,
		ContentEncrypted:     contentEncrypted,
		CoverImageURL:        normalizeMedia(input.CoverImageURL),
		Visibility:           visibility,
		Anonymous:            input.Anonymous,
		AllowedViewerIDs:     allowedViewerIDs,
		AuthorID:             authorID,
		AuthorName:           actor.FullName,
		AuthorUsername:       actor.Username,
		LastEditedByUserID:   authorID,
		LastEditedByName:     actor.FullName,
		LastEditedByUsername: actor.Username,
		LastEditedAt:         now,
		Tags:                 []string{},
		Links:                []storydomain.ExternalLink{},
		Chapters:             chapters,
	}
	if input.Anonymous {
		stored.AuthorName = "Anonymous"
		stored.AuthorUsername = "anonymous"
	}
	if existing == nil {
		stored.CollaborationRevision = 1
		stored.Collaborators = []storydomain.Collaborator{}
		saved, err := s.repo.Insert(ctx, stored)
		if err != nil {
			return SerializedStory{}, err
		}
		return s.serialize(*saved, &authorID)
	}
	stored.ID = existing.ID
	stored.AuthorID = existing.AuthorID
	stored.Collaborators = existing.Collaborators
	stored.ReadCount = existing.ReadCount
	stored.ReactionsCount = existing.ReactionsCount
	stored.LikesCount = existing.LikesCount
	stored.BookmarksCount = existing.BookmarksCount
	stored.SharesCount = existing.SharesCount
	stored.CommentsCount = existing.CommentsCount
	stored.CreatedAt = existing.CreatedAt
	stored.CollaborationRevision = existing.CollaborationRevision + 1
	if existing.AuthorID != authorID {
		stored.AuthorName = existing.AuthorName
		stored.AuthorUsername = existing.AuthorUsername
	}
	saved, err := s.repo.Replace(ctx, stored)
	if err != nil {
		return SerializedStory{}, err
	}
	return s.serialize(*saved, &authorID)
}

func (s *Service) Feed(ctx context.Context, viewerID *bson.ObjectID) ([]SerializedStory, error) {
	stories, err := s.repo.FindFeed(ctx, 50)
	if err != nil {
		return nil, err
	}
	return s.serializeMany(stories, viewerID)
}

func (s *Service) Mine(ctx context.Context, userID bson.ObjectID) ([]SerializedStory, error) {
	stories, err := s.repo.FindMine(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.serializeMany(stories, &userID)
}

func (s *Service) Collaborative(ctx context.Context, userID bson.ObjectID) ([]SerializedStory, error) {
	stories, err := s.repo.FindCollaborative(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.serializeMany(stories, &userID)
}

func (s *Service) MineOne(ctx context.Context, storyID, userID bson.ObjectID) (SerializedStory, error) {
	story, err := s.repo.FindEditableByID(ctx, storyID, userID)
	if err != nil {
		return SerializedStory{}, err
	}
	if story == nil {
		return SerializedStory{}, apperror.NotFound("Story not found")
	}
	return s.serialize(*story, &userID)
}

func (s *Service) PublicBySlug(ctx context.Context, slug string, viewerID *bson.ObjectID) (SerializedStory, error) {
	story, err := s.repo.FindPublicBySlug(ctx, slug)
	if err != nil {
		return SerializedStory{}, err
	}
	if story == nil {
		return SerializedStory{}, apperror.NotFound("Story not found")
	}
	if story.Visibility != "public" {
		if viewerID == nil || !canEditStory(*story, *viewerID) {
			return SerializedStory{}, apperror.NotFound("Story not found")
		}
	}
	s.repo.IncrementReadCount(ctx, story.ID)
	story.ReadCount += 1
	return s.serialize(*story, viewerID)
}

type ReactionResult struct {
	StoryID        string `json:"storyId"`
	Action         string `json:"action"`
	Active         bool   `json:"active"`
	LikesCount     int64  `json:"likesCount"`
	BookmarksCount int64  `json:"bookmarksCount"`
	ReactionsCount int64  `json:"reactionsCount"`
	Status         string `json:"status"`
	Visibility     string `json:"visibility"`
}

func (s *Service) ToggleReaction(ctx context.Context, storyID bson.ObjectID, userID bson.ObjectID, action string) (ReactionResult, error) {
	if action != "like" && action != "bookmark" {
		return ReactionResult{}, apperror.BadRequest("Invalid story reaction action.")
	}
	story, err := s.repo.FindEditableByID(ctx, storyID, userID)
	if err != nil {
		return ReactionResult{}, err
	}
	if story == nil {
		story, err = s.repo.FindPublicByID(ctx, storyID)
		if err != nil {
			return ReactionResult{}, err
		}
	}
	if story == nil || (story.Status != "published" && !canEditStory(*story, userID)) {
		return ReactionResult{}, apperror.NotFound("Story not found")
	}
	active, likes, bookmarks, err := s.repo.ToggleInteraction(ctx, storyID, userID, action)
	if err != nil {
		return ReactionResult{}, err
	}
	return ReactionResult{
		StoryID:        storyID.Hex(),
		Action:         action,
		Active:         active,
		LikesCount:     likes,
		BookmarksCount: bookmarks,
		ReactionsCount: likes + bookmarks,
		Status:         story.Status,
		Visibility:     story.Visibility,
	}, nil
}

func (s *Service) TrackShare(ctx context.Context, storyID bson.ObjectID, userID bson.ObjectID) (map[string]any, error) {
	story, err := s.repo.FindEditableByID(ctx, storyID, userID)
	if err != nil {
		return nil, err
	}
	if story == nil {
		story, err = s.repo.FindPublicByID(ctx, storyID)
		if err != nil {
			return nil, err
		}
	}
	if story == nil || (story.Status != "published" && !canEditStory(*story, userID)) {
		return nil, apperror.NotFound("Story not found")
	}
	count, err := s.repo.IncrementShares(ctx, storyID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"storyId":     storyID.Hex(),
		"sharesCount": count,
		"status":      story.Status,
		"visibility":  story.Visibility,
	}, nil
}

func (s *Service) serializeMany(stories []storydomain.Story, viewerID *bson.ObjectID) ([]SerializedStory, error) {
	out := make([]SerializedStory, 0, len(stories))
	for _, item := range stories {
		serialized, err := s.serialize(item, viewerID)
		if err != nil {
			return nil, err
		}
		out = append(out, serialized)
	}
	return out, nil
}

func (s *Service) serialize(story storydomain.Story, viewerID *bson.ObjectID) (SerializedStory, error) {
	text, err := s.resolveStoryText(story)
	if err != nil {
		return SerializedStory{}, err
	}
	chapters := make([]SerializedChapter, 0, len(story.Chapters))
	for chapterIndex, chapter := range story.Chapters {
		chapterText := ChapterContent{Title: chapter.Title, Body: chapter.Body}
		if chapterIndex < len(text.Chapters) {
			chapterText = text.Chapters[chapterIndex]
		}
		moments := make([]SerializedMoment, 0, len(chapter.Moments))
		for momentIndex, moment := range chapter.Moments {
			momentText := MomentContent{Title: moment.Title, Description: moment.Description}
			if momentIndex < len(chapterText.Moments) {
				momentText = chapterText.Moments[momentIndex]
			}
			moments = append(moments, SerializedMoment{
				ID:                   moment.ID,
				Title:                momentText.Title,
				Description:          momentText.Description,
				HappenedAt:           moment.HappenedAt,
				CreatedByName:        moment.CreatedByName,
				CreatedByUsername:    moment.CreatedByUsername,
				CreatedAt:            moment.CreatedAt,
				LastEditedByName:     moment.LastEditedByName,
				LastEditedByUsername: moment.LastEditedByUsername,
				LastEditedAt:         moment.LastEditedAt,
				ImageURLs:            moment.ImageURLs,
				ImageKeys:            mediaKeys(moment.ImageURLs),
				VoiceNoteURL:         moment.VoiceNoteURL,
				VoiceNoteKey:         mediaKey(moment.VoiceNoteURL),
			})
		}
		chapters = append(chapters, SerializedChapter{
			ID:                   chapter.ID,
			Title:                chapterText.Title,
			Body:                 chapterText.Body,
			Type:                 chapter.Type,
			Order:                chapter.Order,
			CreatedByName:        chapter.CreatedByName,
			CreatedByUsername:    chapter.CreatedByUsername,
			CreatedAt:            chapter.CreatedAt,
			LastEditedByName:     chapter.LastEditedByName,
			LastEditedByUsername: chapter.LastEditedByUsername,
			LastEditedAt:         chapter.LastEditedAt,
			ImageURLs:            chapter.ImageURLs,
			ImageKeys:            mediaKeys(chapter.ImageURLs),
			VoiceNoteURL:         chapter.VoiceNoteURL,
			VoiceNoteKey:         mediaKey(chapter.VoiceNoteURL),
			Moments:              moments,
		})
	}
	isOwner := viewerID != nil && story.AuthorID == *viewerID
	canEdit := viewerID != nil && canEditStory(story, *viewerID)
	return SerializedStory{
		ID:                    story.ID.Hex(),
		Slug:                  story.Slug,
		Status:                story.Status,
		Title:                 text.Title,
		Summary:               text.Summary,
		CoverImageURL:         story.CoverImageURL,
		CoverImageKey:         mediaKey(story.CoverImageURL),
		Visibility:            story.Visibility,
		Anonymous:             story.Anonymous,
		AuthorName:            story.AuthorName,
		AuthorUsername:        story.AuthorUsername,
		AuthorID:              story.AuthorID.Hex(),
		IsOwner:               isOwner,
		CanEdit:               canEdit,
		Collaborators:         story.Collaborators,
		CollaborationRevision: story.CollaborationRevision,
		Collaborative:         len(story.Collaborators) > 0,
		LastEditedByName:      story.LastEditedByName,
		LastEditedByUsername:  story.LastEditedByUsername,
		LastEditedAt:          story.LastEditedAt,
		AuthorVerified:        false,
		Following:             false,
		Tags:                  text.Tags,
		Links:                 text.Links,
		ReadCount:             story.ReadCount,
		ReactionsCount:        story.ReactionsCount,
		LikesCount:            story.LikesCount,
		BookmarksCount:        story.BookmarksCount,
		SharesCount:           story.SharesCount,
		CommentsCount:         story.CommentsCount,
		ChapterCount:          len(chapters),
		CommentCount:          story.CommentsCount,
		Liked:                 false,
		Bookmarked:            false,
		Chapters:              chapters,
		CreatedAt:             story.CreatedAt,
		UpdatedAt:             story.UpdatedAt,
	}, nil
}

func (s *Service) resolveStoryText(story storydomain.Story) (StoryTextContent, error) {
	if story.ContentEncrypted != "" {
		decrypted, err := cryptoutil.DecryptJSON[StoryTextContent](s.cfg.DataEncryptionKey, story.ContentEncrypted)
		if err != nil {
			return StoryTextContent{}, err
		}
		if decrypted != nil {
			return *decrypted, nil
		}
	}
	return StoryTextContent{
		Title:    story.Title,
		Summary:  story.Summary,
		Tags:     story.Tags,
		Links:    convertLinks(story.Links),
		Chapters: convertChapters(story.Chapters),
	}, nil
}

func canEditStory(story storydomain.Story, userID bson.ObjectID) bool {
	if story.AuthorID == userID {
		return true
	}
	for _, collaborator := range story.Collaborators {
		if collaborator.UserID == userID {
			return true
		}
	}
	return false
}

func isCollaborativeStory(story storydomain.Story) bool {
	return len(story.Collaborators) > 0
}

func convertLinks(links []storydomain.ExternalLink) []StoryLinkContent {
	out := make([]StoryLinkContent, 0, len(links))
	for _, link := range links {
		out = append(out, StoryLinkContent{Label: link.Label, URL: link.URL, Kind: link.Kind})
	}
	return out
}

func convertChapters(chapters []storydomain.Chapter) []ChapterContent {
	out := make([]ChapterContent, 0, len(chapters))
	for _, chapter := range chapters {
		moments := make([]MomentContent, 0, len(chapter.Moments))
		for _, moment := range chapter.Moments {
			moments = append(moments, MomentContent{Title: moment.Title, Description: moment.Description})
		}
		out = append(out, ChapterContent{Title: chapter.Title, Body: chapter.Body, Moments: moments})
	}
	return out
}

func mediaKeys(values []string) []string {
	keys := make([]string, 0, len(values))
	for _, value := range values {
		keys = append(keys, mediaKey(value))
	}
	return keys
}

func mediaKey(value string) string {
	if strings.HasPrefix(value, "users/") {
		return value
	}
	return value
}

func validateSaveInput(input SaveInput) error {
	if strings.TrimSpace(input.Title) == "" || len(strings.TrimSpace(input.Title)) < 3 {
		return apperror.BadRequest("Add a clearer story title before continuing.")
	}
	if len(strings.Fields(input.Summary)) < 20 {
		return apperror.BadRequest("Add a fuller story summary with at least 20 words.")
	}
	if len(input.Chapters) == 0 {
		return apperror.BadRequest("At least one chapter is required.")
	}
	return nil
}

func exceedsFreeLimits(input SaveInput) bool {
	images := 0
	voices := 0
	for _, chapter := range input.Chapters {
		images += len(chapter.ImageURLs)
		if chapter.VoiceNoteURL != "" {
			voices += 1
		}
	}
	return len(input.Chapters) > 2 || images > 2 || voices > 1
}

func (s *Service) uniqueSlug(ctx context.Context, title string, storyID *bson.ObjectID) (string, error) {
	base := slugify(title)
	if base == "" {
		base = "story"
	}
	next := base
	for suffix := 1; ; suffix++ {
		existing, err := s.repo.FindSlug(ctx, next)
		if err != nil {
			return "", err
		}
		if existing == nil || (storyID != nil && existing.ID == *storyID) {
			return next, nil
		}
		next = base + "-" + strconv.Itoa(suffix+1)
	}
}

func slugify(value string) string {
	normalized := strings.ToLower(value)
	re := regexp.MustCompile(`[^a-z0-9]+`)
	slug := strings.Trim(re.ReplaceAllString(normalized, "-"), "-")
	if len(slug) > 72 {
		return slug[:72]
	}
	return slug
}

func momentTextContent(moments []MomentInput) []MomentContent {
	out := make([]MomentContent, 0, len(moments))
	for _, moment := range moments {
		out = append(out, MomentContent{Title: moment.Title, Description: moment.Description})
	}
	return out
}

func (s *Service) storedChapter(input ChapterInput, existing *storydomain.Story, index int, editorName string, editorUsername string, occurredAt time.Time) storydomain.Chapter {
	chapterID := input.ID
	var existingChapter *storydomain.Chapter
	if existing != nil {
		for chapterIndex := range existing.Chapters {
			if existing.Chapters[chapterIndex].ID == input.ID || chapterIndex == index {
				existingChapter = &existing.Chapters[chapterIndex]
				if chapterID == "" {
					chapterID = existing.Chapters[chapterIndex].ID
				}
				break
			}
		}
	}
	if chapterID == "" {
		chapterID = "chapter-" + bson.NewObjectID().Hex()
	}
	moments := make([]storydomain.Moment, 0, len(input.Moments))
	for momentIndex, moment := range input.Moments {
		happenedAt, _ := time.Parse(time.RFC3339, moment.HappenedAt)
		if happenedAt.IsZero() {
			happenedAt = occurredAt
		}
		momentID := moment.ID
		if existingChapter != nil && momentIndex < len(existingChapter.Moments) && momentID == "" {
			momentID = existingChapter.Moments[momentIndex].ID
		}
		if momentID == "" {
			momentID = "moment-" + bson.NewObjectID().Hex()
		}
		moments = append(moments, storydomain.Moment{
			ID:                   momentID,
			Title:                cryptoutil.EncryptedContentPlaceholder,
			Description:          cryptoutil.EncryptedContentPlaceholder,
			HappenedAt:           happenedAt,
			ImageURLs:            normalizeMediaList(moment.ImageURLs),
			VoiceNoteURL:         normalizeMedia(moment.VoiceNoteURL),
			CreatedByName:        editorName,
			CreatedByUsername:    editorUsername,
			CreatedAt:            occurredAt,
			LastEditedByName:     editorName,
			LastEditedByUsername: editorUsername,
			LastEditedAt:         occurredAt,
		})
	}
	chapterType := input.Type
	if chapterType == "" {
		chapterType = "memory"
	}
	order := input.Order
	if order <= 0 {
		order = index + 1
	}
	return storydomain.Chapter{
		ID:                   chapterID,
		Title:                cryptoutil.EncryptedContentPlaceholder,
		Body:                 cryptoutil.EncryptedContentPlaceholder,
		Type:                 chapterType,
		Order:                order,
		ImageURLs:            normalizeMediaList(input.ImageURLs),
		VoiceNoteURL:         normalizeMedia(input.VoiceNoteURL),
		Moments:              moments,
		CreatedByName:        editorName,
		CreatedByUsername:    editorUsername,
		CreatedAt:            occurredAt,
		LastEditedByName:     editorName,
		LastEditedByUsername: editorUsername,
		LastEditedAt:         occurredAt,
	}
}

func parseObjectIDs(values []string) []bson.ObjectID {
	out := make([]bson.ObjectID, 0, len(values))
	for _, value := range values {
		if id, err := bson.ObjectIDFromHex(value); err == nil {
			out = append(out, id)
		}
	}
	return out
}

func normalizeMediaList(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		if normalized := normalizeMedia(value); normalized != "" {
			out = append(out, normalized)
		}
	}
	return out
}

func normalizeMedia(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	if strings.HasPrefix(value, "users/") {
		return value
	}
	if index := strings.Index(value, "users/"); index >= 0 {
		return value[index:]
	}
	return value
}

func snapshotsEqual(left SerializedStory, input SaveInput) bool {
	payload, _ := json.Marshal(left)
	next, _ := json.Marshal(input)
	return string(payload) == string(next)
}
