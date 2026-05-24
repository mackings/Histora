package status

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"strings"
	"time"

	"github.com/mackings/histora/apps/api-go/internal/config"
	statusdomain "github.com/mackings/histora/apps/api-go/internal/domain/status"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/cryptoutil"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type Service struct {
	cfg  config.Config
	repo *Repository
}

type CreateInput struct {
	Body       string `json:"body"`
	Anonymous  bool   `json:"anonymous"`
	Visibility string `json:"visibility"`
	ImageURL   string `json:"imageUrl,omitempty"`
	ImageKey   string `json:"imageKey,omitempty"`
}

type Response struct {
	ID             string `json:"id"`
	AuthorName     string `json:"authorName"`
	AuthorUsername string `json:"authorUsername"`
	Body           string `json:"body"`
	Anonymous      bool   `json:"anonymous"`
	Visibility     string `json:"visibility"`
	AuthorVerified bool   `json:"authorVerified"`
	ImageURL       any    `json:"imageUrl"`
	ImageKey       any    `json:"imageKey"`
	ShareSlug      any    `json:"shareSlug"`
	CommentsCount  int64  `json:"commentsCount"`
	LikesCount     int64  `json:"likesCount"`
	BookmarksCount int64  `json:"bookmarksCount"`
	CreatedAt      any    `json:"createdAt"`
	ExpiresAt      any    `json:"expiresAt,omitempty"`
}

func NewService(cfg config.Config, repo *Repository) *Service {
	return &Service{cfg: cfg, repo: repo}
}

func (s *Service) Create(ctx context.Context, userID bson.ObjectID, input CreateInput) (Response, error) {
	author, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return Response{}, err
	}
	if author == nil {
		return Response{}, apperror.NotFound("User not found")
	}
	body := strings.TrimSpace(input.Body)
	if body == "" && input.ImageURL == "" && input.ImageKey == "" {
		return Response{}, apperror.BadRequest("Status needs text or media.")
	}
	if len(body) > 500 {
		return Response{}, apperror.BadRequest("Status body is too long.")
	}
	encrypted := ""
	statusBody := ""
	if body != "" {
		encrypted, err = cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, body)
		if err != nil {
			return Response{}, err
		}
		statusBody = cryptoutil.EncryptedContentPlaceholder
	}
	visibility := input.Visibility
	if visibility == "" {
		visibility = "public"
	}
	status := statusdomain.Status{
		AuthorID:       userID,
		AuthorName:     author.FullName,
		AuthorUsername: author.Username,
		Body:           statusBody,
		BodyEncrypted:  encrypted,
		Anonymous:      input.Anonymous,
		Visibility:     visibility,
		ImageURL:       input.ImageURL,
		ImageKey:       firstNonEmpty(input.ImageKey, mediaKey(input.ImageURL)),
		ExpiresAt:      time.Now().Add(24 * time.Hour),
	}
	if input.Anonymous {
		status.AuthorName = "Anonymous"
		status.AuthorUsername = "anonymous"
		status.ShareSlug = buildShareSlug()
	}
	created, err := s.repo.Insert(ctx, status)
	if err != nil {
		return Response{}, err
	}
	return s.serialize(*created)
}

func (s *Service) Feed(ctx context.Context, userID *bson.ObjectID) ([]Response, error) {
	statuses, err := s.repo.Feed(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.serializeMany(statuses)
}

func (s *Service) Mine(ctx context.Context, userID bson.ObjectID) ([]Response, error) {
	statuses, err := s.repo.Mine(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.serializeMany(statuses)
}

func (s *Service) ByShareSlug(ctx context.Context, slug string) (Response, error) {
	status, err := s.repo.ByShareSlug(ctx, slug)
	if err != nil {
		return Response{}, err
	}
	if status == nil {
		return Response{}, apperror.NotFound("Anonymous status not found")
	}
	return s.serialize(*status)
}

func (s *Service) Delete(ctx context.Context, statusID bson.ObjectID, userID bson.ObjectID) error {
	status, err := s.repo.FindByID(ctx, statusID)
	if err != nil {
		return err
	}
	if status == nil || status.AuthorID != userID {
		return apperror.NotFound("Status not found")
	}
	return s.repo.DeleteOwned(ctx, statusID, userID)
}

func (s *Service) ToggleReaction(ctx context.Context, statusID bson.ObjectID, userID bson.ObjectID, action string) (map[string]any, error) {
	if action != "like" && action != "bookmark" {
		return nil, apperror.BadRequest("Invalid status reaction action.")
	}
	status, err := s.repo.FindByID(ctx, statusID)
	if err != nil {
		return nil, err
	}
	if status == nil {
		return nil, apperror.NotFound("Status not found")
	}
	active, likes, bookmarks, err := s.repo.ToggleInteraction(ctx, statusID, userID, action)
	if err != nil {
		return nil, err
	}
	return map[string]any{"statusId": statusID.Hex(), "action": action, "active": active, "likesCount": likes, "bookmarksCount": bookmarks}, nil
}

func (s *Service) serializeMany(statuses []statusdomain.Status) ([]Response, error) {
	out := make([]Response, 0, len(statuses))
	for _, status := range statuses {
		item, err := s.serialize(status)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Service) serialize(status statusdomain.Status) (Response, error) {
	body := status.Body
	if status.BodyEncrypted != "" {
		decrypted, err := cryptoutil.DecryptSensitiveValue(s.cfg.DataEncryptionKey, status.BodyEncrypted)
		if err != nil {
			return Response{}, err
		}
		body = decrypted
	}
	return Response{
		ID:             status.ID.Hex(),
		AuthorName:     status.AuthorName,
		AuthorUsername: status.AuthorUsername,
		Body:           body,
		Anonymous:      status.Anonymous,
		Visibility:     status.Visibility,
		AuthorVerified: false,
		ImageURL:       nullableString(status.ImageURL),
		ImageKey:       nullableString(firstNonEmpty(status.ImageKey, mediaKey(status.ImageURL))),
		ShareSlug:      nullableString(status.ShareSlug),
		CommentsCount:  status.CommentsCount,
		LikesCount:     status.LikesCount,
		BookmarksCount: status.BookmarksCount,
		CreatedAt:      status.CreatedAt,
		ExpiresAt:      status.ExpiresAt,
	}, nil
}

func buildShareSlug() string {
	buffer := make([]byte, 5)
	_, _ = rand.Read(buffer)
	return "status-" + time.Now().Format("20060102150405") + "-" + base64.RawURLEncoding.EncodeToString(buffer)
}

func mediaKey(value string) string {
	if strings.HasPrefix(value, "users/") {
		return value
	}
	if index := strings.Index(value, "users/"); index >= 0 {
		return value[index:]
	}
	return ""
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
