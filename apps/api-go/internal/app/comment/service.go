package comment

import (
	"context"
	"strings"

	"github.com/mackings/histora/apps/api-go/internal/config"
	commentdomain "github.com/mackings/histora/apps/api-go/internal/domain/comment"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/cryptoutil"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type Service struct {
	cfg  config.Config
	repo *Repository
}

type CreateInput struct {
	TargetType       string `json:"targetType"`
	TargetID         string `json:"targetId"`
	Body             string `json:"body"`
	ReplyToCommentID string `json:"replyToCommentId,omitempty"`
	ShareSlug        string `json:"shareSlug,omitempty"`
}

type Response struct {
	ID               string `json:"id"`
	TargetType       string `json:"targetType"`
	TargetID         string `json:"targetId"`
	AuthorName       string `json:"authorName"`
	AuthorUsername   string `json:"authorUsername"`
	Body             string `json:"body"`
	ReplyToCommentID string `json:"replyToCommentId,omitempty"`
	CreatedAt        any    `json:"createdAt"`
}

func NewService(cfg config.Config, repo *Repository) *Service {
	return &Service{cfg: cfg, repo: repo}
}

func (s *Service) Create(ctx context.Context, userID bson.ObjectID, input CreateInput) (Response, error) {
	if err := s.assertTarget(ctx, input.TargetType, input.TargetID); err != nil {
		return Response{}, err
	}
	body := strings.TrimSpace(input.Body)
	if body == "" || len(body) > 1200 {
		return Response{}, apperror.BadRequest("Comment must be between 1 and 1200 characters.")
	}
	author, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return Response{}, err
	}
	if author == nil {
		return Response{}, apperror.NotFound("User not found")
	}
	encrypted, err := cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, body)
	if err != nil {
		return Response{}, err
	}
	comment, err := s.repo.Insert(ctx, commentdomain.Comment{
		TargetType:       input.TargetType,
		TargetID:         input.TargetID,
		AuthorID:         userID,
		AuthorName:       author.FullName,
		AuthorUsername:   author.Username,
		Body:             cryptoutil.EncryptedContentPlaceholder,
		BodyEncrypted:    encrypted,
		ReplyToCommentID: input.ReplyToCommentID,
	})
	if err != nil {
		return Response{}, err
	}
	switch input.TargetType {
	case "storyChapter":
		s.repo.IncrementStoryComments(ctx, input.TargetID)
	case "status":
		s.repo.IncrementStatusComments(ctx, input.TargetID)
	case "anonymousMessage":
		s.repo.IncrementAnonymousComments(ctx, input.TargetID)
	}
	return s.toResponse(*comment, false)
}

func (s *Service) List(ctx context.Context, targetType string, targetID string) ([]Response, error) {
	if err := s.assertTarget(ctx, targetType, targetID); err != nil {
		return nil, err
	}
	comments, err := s.repo.List(ctx, targetType, targetID)
	if err != nil {
		return nil, err
	}
	anonymous := targetType == "anonymousMessage"
	out := make([]Response, 0, len(comments))
	for _, comment := range comments {
		item, err := s.toResponse(comment, anonymous)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Service) assertTarget(ctx context.Context, targetType string, targetID string) error {
	var ok bool
	var err error
	switch targetType {
	case "storyChapter":
		ok, err = s.repo.StoryChapterExists(ctx, targetID)
	case "status":
		ok, err = s.repo.StatusExists(ctx, targetID)
	case "anonymousMessage":
		ok, err = s.repo.AnonymousMessageExists(ctx, targetID)
	default:
		return apperror.BadRequest("Invalid comment target type.")
	}
	if err != nil {
		return err
	}
	if !ok {
		return apperror.NotFound("Comment target not found")
	}
	return nil
}

func (s *Service) toResponse(comment commentdomain.Comment, anonymous bool) (Response, error) {
	body := comment.Body
	if comment.BodyEncrypted != "" {
		decrypted, err := cryptoutil.DecryptSensitiveValue(s.cfg.DataEncryptionKey, comment.BodyEncrypted)
		if err != nil {
			return Response{}, err
		}
		body = decrypted
	}
	authorName := comment.AuthorName
	authorUsername := comment.AuthorUsername
	if anonymous {
		authorName = "Anonymous"
		authorUsername = "anonymous"
	}
	return Response{
		ID:               comment.ID.Hex(),
		TargetType:       comment.TargetType,
		TargetID:         comment.TargetID,
		AuthorName:       authorName,
		AuthorUsername:   authorUsername,
		Body:             body,
		ReplyToCommentID: comment.ReplyToCommentID,
		CreatedAt:        comment.CreatedAt,
	}, nil
}
