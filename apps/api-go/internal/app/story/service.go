package story

import (
	"context"
	"strings"

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
