package media

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Service struct {
	cfg     config.Config
	s3      *s3.Client
	presign *s3.PresignClient
	db      *mongo.Database
}

type SignedUploadInput struct {
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
}

func NewService(cfg config.Config, db *mongo.Database) *Service {
	options := s3.Options{
		Region:       "auto",
		Credentials:  aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(cfg.R2AccessKeyID, cfg.R2SecretAccessKey, "")),
		BaseEndpoint: aws.String("https://" + cfg.R2AccountID + ".r2.cloudflarestorage.com"),
	}
	client := s3.New(options)
	return &Service{cfg: cfg, s3: client, presign: s3.NewPresignClient(client), db: db}
}

func (s *Service) SignedUpload(ctx context.Context, userID string, input SignedUploadInput) (map[string]any, error) {
	if err := s.assertConfigured(); err != nil {
		return nil, err
	}
	if !allowedContentType(input.ContentType) {
		return nil, apperror.BadRequest("Unsupported media content type.")
	}
	objectKey := buildObjectKey(userID, input.FileName, input.ContentType)
	result, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.R2BucketName),
		Key:         aws.String(objectKey),
		ContentType: aws.String(input.ContentType),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return nil, err
	}
	return map[string]any{"uploadUrl": result.URL, "objectKey": objectKey, "publicUrl": s.publicURL(objectKey)}, nil
}

func (s *Service) SignedRead(ctx context.Context, userID bson.ObjectID, objectKey string, storyID string, statusID string) (map[string]any, error) {
	if err := s.assertConfigured(); err != nil {
		return nil, err
	}
	if !strings.HasPrefix(objectKey, "users/"+userID.Hex()+"/") &&
		!s.canReadStoryMedia(ctx, userID, objectKey, storyID) &&
		!s.canReadStatusMedia(ctx, userID, objectKey, statusID) {
		return nil, apperror.Forbidden("You do not have access to this media object.")
	}
	result, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2BucketName),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return nil, err
	}
	return map[string]any{"objectKey": objectKey, "readUrl": result.URL}, nil
}

func (s *Service) PublicRead(ctx context.Context, objectKey string, storyID string, statusID string) (map[string]any, error) {
	if err := s.assertConfigured(); err != nil {
		return nil, err
	}
	if !s.canReadPublicStoryMedia(ctx, objectKey, storyID) && !s.canReadPublicStatusMedia(ctx, objectKey, statusID) {
		return nil, apperror.Forbidden("You do not have access to this media object.")
	}
	result, err := s.presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.cfg.R2BucketName),
		Key:    aws.String(objectKey),
	}, s3.WithPresignExpires(15*time.Minute))
	if err != nil {
		return nil, err
	}
	return map[string]any{"objectKey": objectKey, "readUrl": result.URL}, nil
}

func (s *Service) UploadDirect(ctx context.Context, userID string, fileName string, contentType string, body []byte) (map[string]any, error) {
	if err := s.assertConfigured(); err != nil {
		return nil, err
	}
	if err := validateUpload(body, contentType); err != nil {
		return nil, err
	}
	objectKey := buildObjectKey(userID, fileName, contentType)
	_, err := s.s3.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.cfg.R2BucketName),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(body),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return nil, err
	}
	readURL := s.publicURL(objectKey)
	if readURL == nil {
		ownerID, err := bson.ObjectIDFromHex(userID)
		if err != nil {
			return nil, apperror.Forbidden("You do not have access to this media object.")
		}
		signed, err := s.SignedRead(ctx, ownerID, objectKey, "", "")
		if err != nil {
			return nil, err
		}
		readURL = signed["readUrl"]
	}
	return map[string]any{"objectKey": objectKey, "readUrl": readURL}, nil
}

func (s *Service) canReadStatusMedia(ctx context.Context, userID bson.ObjectID, objectKey string, statusID string) bool {
	status, ok := s.findStatusMediaAudience(ctx, objectKey, statusID)
	if !ok {
		return false
	}
	return status.Visibility == "public" || status.AuthorID == userID
}

func (s *Service) findStatusMediaAudience(ctx context.Context, objectKey string, statusID string) (struct {
	AuthorID   bson.ObjectID
	Visibility string
}, bool) {
	var empty struct {
		AuthorID   bson.ObjectID
		Visibility string
	}
	if s.db == nil || objectKey == "" || statusID == "" {
		return empty, false
	}
	id, err := bson.ObjectIDFromHex(strings.TrimSpace(statusID))
	if err != nil {
		return empty, false
	}
	var status struct {
		AuthorID   bson.ObjectID `bson:"authorId"`
		Visibility string        `bson:"visibility"`
		ImageURL   string        `bson:"imageUrl"`
		ImageKey   string        `bson:"imageKey"`
	}
	err = s.db.Collection("statuses").FindOne(
		ctx,
		bson.M{"_id": id},
		options.FindOne().SetProjection(bson.M{"authorId": 1, "visibility": 1, "imageUrl": 1, "imageKey": 1}),
	).Decode(&status)
	if err != nil {
		return empty, false
	}
	if !storyReferencesObject(status.ImageURL, objectKey) && !storyReferencesObject(status.ImageKey, objectKey) {
		return empty, false
	}
	return struct {
		AuthorID   bson.ObjectID
		Visibility string
	}{AuthorID: status.AuthorID, Visibility: status.Visibility}, true
}

func (s *Service) canReadPublicStoryMedia(ctx context.Context, objectKey string, storyID string) bool {
	story, ok := s.findStoryMediaAudience(ctx, objectKey, storyID)
	return ok && story.Status == "published" && story.Visibility == "public"
}

func (s *Service) canReadPublicStatusMedia(ctx context.Context, objectKey string, statusID string) bool {
	status, ok := s.findStatusMediaAudience(ctx, objectKey, statusID)
	return ok && status.Visibility == "public"
}

func (s *Service) canReadStoryMedia(ctx context.Context, userID bson.ObjectID, objectKey string, storyID string) bool {
	story, ok := s.findStoryMediaAudience(ctx, objectKey, storyID)
	if !ok {
		return false
	}
	if story.Status == "published" && story.Visibility == "public" {
		return true
	}
	if story.AuthorID == userID {
		return true
	}
	for _, collaborator := range story.Collaborators {
		if collaborator.UserID == userID {
			return true
		}
	}
	if story.Status == "published" {
		for _, viewerID := range story.AllowedViewerIDs {
			if viewerID == userID {
				return true
			}
		}
	}
	return false
}

func (s *Service) findStoryMediaAudience(ctx context.Context, objectKey string, storyID string) (struct {
	Status           string
	Visibility       string
	AuthorID         bson.ObjectID
	AllowedViewerIDs []bson.ObjectID
	Collaborators    []struct {
		UserID bson.ObjectID `bson:"userId"`
	}
}, bool) {
	var empty struct {
		Status           string
		Visibility       string
		AuthorID         bson.ObjectID
		AllowedViewerIDs []bson.ObjectID
		Collaborators    []struct {
			UserID bson.ObjectID `bson:"userId"`
		}
	}
	if s.db == nil || objectKey == "" || storyID == "" {
		return empty, false
	}
	id, err := bson.ObjectIDFromHex(strings.TrimSpace(storyID))
	if err != nil {
		return empty, false
	}
	var story struct {
		Status           string          `bson:"status"`
		Visibility       string          `bson:"visibility"`
		CoverImageURL    string          `bson:"coverImageUrl"`
		AuthorID         bson.ObjectID   `bson:"authorId"`
		AllowedViewerIDs []bson.ObjectID `bson:"allowedViewerIds"`
		Collaborators    []struct {
			UserID bson.ObjectID `bson:"userId"`
		} `bson:"collaborators"`
		Chapters []struct {
			ImageURLs    []string `bson:"imageUrls"`
			VoiceNoteURL string   `bson:"voiceNoteUrl"`
			Moments      []struct {
				ImageURLs    []string `bson:"imageUrls"`
				VoiceNoteURL string   `bson:"voiceNoteUrl"`
			} `bson:"moments"`
		} `bson:"chapters"`
	}
	err = s.db.Collection("stories").FindOne(
		ctx,
		bson.M{"_id": id},
		options.FindOne().SetProjection(bson.M{
			"status": 1, "visibility": 1, "coverImageUrl": 1, "authorId": 1,
			"allowedViewerIds": 1, "collaborators.userId": 1, "chapters.imageUrls": 1,
			"chapters.voiceNoteUrl": 1, "chapters.moments.imageUrls": 1, "chapters.moments.voiceNoteUrl": 1,
		}),
	).Decode(&story)
	if err != nil || !storyReferencesObject(story.CoverImageURL, objectKey) {
		found := false
		for _, chapter := range story.Chapters {
			if storyReferencesAny(chapter.ImageURLs, objectKey) || storyReferencesObject(chapter.VoiceNoteURL, objectKey) {
				found = true
				break
			}
			for _, moment := range chapter.Moments {
				if storyReferencesAny(moment.ImageURLs, objectKey) || storyReferencesObject(moment.VoiceNoteURL, objectKey) {
					found = true
					break
				}
			}
			if found {
				break
			}
		}
		if err != nil || !found {
			return empty, false
		}
	}
	return struct {
		Status           string
		Visibility       string
		AuthorID         bson.ObjectID
		AllowedViewerIDs []bson.ObjectID
		Collaborators    []struct {
			UserID bson.ObjectID `bson:"userId"`
		}
	}{
		Status:           story.Status,
		Visibility:       story.Visibility,
		AuthorID:         story.AuthorID,
		AllowedViewerIDs: story.AllowedViewerIDs,
		Collaborators:    story.Collaborators,
	}, true
}

func storyReferencesAny(values []string, objectKey string) bool {
	for _, value := range values {
		if storyReferencesObject(value, objectKey) {
			return true
		}
	}
	return false
}

func storyReferencesObject(value string, objectKey string) bool {
	if value == objectKey {
		return true
	}
	return strings.Contains(value, "/"+objectKey)
}

func (s *Service) assertConfigured() error {
	if s.cfg.R2AccountID == "" || s.cfg.R2AccessKeyID == "" || s.cfg.R2SecretAccessKey == "" || s.cfg.R2BucketName == "" {
		return apperror.New(500, "Cloudflare R2 is not configured on the server.")
	}
	return nil
}

func (s *Service) publicURL(objectKey string) any {
	if s.cfg.R2PublicBaseURL == "" {
		return nil
	}
	return strings.TrimRight(s.cfg.R2PublicBaseURL, "/") + "/" + objectKey
}

func buildObjectKey(userID string, fileName string, contentType string) string {
	extension := extensionFor(contentType)
	base := sanitizeFileName(strings.TrimSuffix(path.Base(fileName), path.Ext(fileName)))
	if base == "" {
		base = "upload"
	}
	random := make([]byte, 4)
	_, _ = rand.Read(random)
	return "users/" + userID + "/" + time.Now().Format("20060102150405") + "-" + hex.EncodeToString(random) + "-" + base + extension
}

func sanitizeFileName(value string) string {
	re := regexp.MustCompile(`[^a-z0-9.\-_]+`)
	return strings.Trim(re.ReplaceAllString(strings.ToLower(value), "-"), "-")
}

func extensionFor(contentType string) string {
	switch contentType {
	case "image/jpeg":
		return ".jpg"
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	case "audio/webm":
		return ".webm"
	case "audio/mp4":
		return ".m4a"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav":
		return ".wav"
	case "audio/ogg":
		return ".ogg"
	case "video/mp4":
		return ".mp4"
	case "video/webm":
		return ".webm"
	default:
		return ".bin"
	}
}

func allowedContentType(contentType string) bool {
	_, ok := maxBytesByContentType[contentType]
	return ok
}

var maxBytesByContentType = map[string]int{
	"image/jpeg": 12 * 1024 * 1024,
	"image/png":  12 * 1024 * 1024,
	"image/webp": 12 * 1024 * 1024,
	"image/gif":  12 * 1024 * 1024,
	"audio/webm": 24 * 1024 * 1024,
	"audio/mp4":  24 * 1024 * 1024,
	"audio/mpeg": 24 * 1024 * 1024,
	"audio/wav":  24 * 1024 * 1024,
	"audio/ogg":  24 * 1024 * 1024,
	"video/mp4":  32 * 1024 * 1024,
	"video/webm": 32 * 1024 * 1024,
}

func validateUpload(body []byte, contentType string) error {
	maxBytes, ok := maxBytesByContentType[contentType]
	if !ok {
		return apperror.BadRequest("Unsupported media content type.")
	}
	if len(body) == 0 {
		return apperror.BadRequest("Upload payload is empty.")
	}
	if len(body) > maxBytes {
		return apperror.New(413, "Upload exceeds the allowed size for this media type.")
	}
	if !matchesMagic(body, contentType) {
		return apperror.BadRequest("Upload payload does not match the declared file type.")
	}
	return nil
}

func matchesMagic(body []byte, contentType string) bool {
	hasPrefix := func(signature ...byte) bool {
		return len(body) >= len(signature) && bytes.Equal(body[:len(signature)], signature)
	}
	hasAt := func(offset int, value string) bool {
		return len(body) >= offset+len(value) && string(body[offset:offset+len(value)]) == value
	}
	switch contentType {
	case "image/jpeg":
		return hasPrefix(0xff, 0xd8, 0xff)
	case "image/png":
		return hasPrefix(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
	case "image/gif":
		return hasAt(0, "GIF87a") || hasAt(0, "GIF89a")
	case "image/webp":
		return hasAt(0, "RIFF") && hasAt(8, "WEBP")
	case "audio/wav":
		return hasAt(0, "RIFF") && hasAt(8, "WAVE")
	case "audio/ogg":
		return hasAt(0, "OggS")
	case "audio/mpeg":
		return hasAt(0, "ID3") || (len(body) >= 2 && body[0] == 0xff && (body[1]&0xe0) == 0xe0)
	case "audio/webm", "video/webm":
		return hasPrefix(0x1a, 0x45, 0xdf, 0xa3)
	case "audio/mp4", "video/mp4":
		return len(body) >= 12 && hasAt(4, "ftyp")
	default:
		return false
	}
}
