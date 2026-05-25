package profile

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/mackings/histora/apps/api-go/internal/config"
	storydomain "github.com/mackings/histora/apps/api-go/internal/domain/story"
	"github.com/mackings/histora/apps/api-go/internal/domain/user"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"github.com/mackings/histora/apps/api-go/internal/shared/cryptoutil"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Service struct {
	cfg config.Config
	db  *mongo.Database
}

func NewService(cfg config.Config, db *mongo.Database) *Service {
	return &Service{cfg: cfg, db: db}
}

type UpdateInput struct {
	FullName               string `json:"fullName"`
	Username               string `json:"username"`
	Bio                    string `json:"bio"`
	Location               string `json:"location"`
	AvatarURL              string `json:"avatarUrl"`
	ProfileVisibility      string `json:"profileVisibility"`
	DefaultStoryVisibility string `json:"defaultStoryVisibility"`
	AllowCommentsByDefault *bool  `json:"allowCommentsByDefault"`
	AllowHelpRequests      *bool  `json:"allowHelpRequests"`
	HideReadCounts         *bool  `json:"hideReadCounts"`
	ShowAnonymousActivity  *bool  `json:"showAnonymousActivity"`
}

type InviteInput struct {
	Email   string `json:"email"`
	Circle  string `json:"circle"`
	StoryID string `json:"storyId"`
}

type DeviceRenameInput struct {
	Label string `json:"label"`
}

type PushSubscriptionInput struct {
	DeviceID     string `json:"deviceId"`
	DeviceName   string `json:"deviceName"`
	Subscription struct {
		Endpoint       string `json:"endpoint"`
		ExpirationTime *int64 `json:"expirationTime"`
		Keys           struct {
			P256DH string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	} `json:"subscription"`
}

type PushSubscriptionDeleteInput struct {
	Endpoint string `json:"endpoint"`
}

type FollowResult struct {
	Username       string `json:"username"`
	Active         bool   `json:"active"`
	Following      bool   `json:"following"`
	FollowerUserID string `json:"followerUserId"`
	FollowerName   string `json:"followerName"`
	FollowerHandle string `json:"followerUsername"`
	TargetUserID   string `json:"targetUserId"`
	TargetName     string `json:"targetName"`
	TargetUsername string `json:"targetUsername"`
}

type storyTextContent struct {
	Title    string `json:"title"`
	Summary  string `json:"summary"`
	Chapters []struct {
		Title string `json:"title"`
		Body  string `json:"body"`
	} `json:"chapters"`
}

func (s *Service) Dashboard(ctx context.Context, userID bson.ObjectID) (map[string]any, error) {
	u, err := s.user(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, apperror.NotFound("User not found")
	}
	stories, err := s.stories(ctx, bson.M{"authorId": userID}, 100)
	if err != nil {
		return nil, err
	}
	followers, _ := s.db.Collection("follows").CountDocuments(ctx, bson.M{"followeeUserId": userID})
	following, _ := s.db.Collection("follows").CountDocuments(ctx, bson.M{"followerUserId": userID})
	anonymousSent, _ := s.db.Collection("anonymousmessages").CountDocuments(ctx, bson.M{"senderUserId": userID})
	anonymousInbox, _ := s.db.Collection("anonymousmessages").CountDocuments(ctx, bson.M{"recipientUserId": userID})
	activeSessions, _ := s.db.Collection("sessions").CountDocuments(ctx, bson.M{"userId": userID, "revokedAt": nil, "expiresAt": bson.M{"$gt": time.Now()}})
	published := 0
	totalChapters := 0
	totalReads := int64(0)
	storyRows := make([]map[string]any, 0, len(stories))
	for _, story := range stories {
		if story.Status == "published" {
			published++
		}
		totalChapters += len(story.Chapters)
		totalReads += story.ReadCount
		title := s.storyTitle(story)
		storyRows = append(storyRows, map[string]any{
			"id":             story.ID.Hex(),
			"title":          title,
			"visibility":     strings.ToUpper(story.Visibility),
			"chapters":       chapterLabel(len(story.Chapters)),
			"chapterCount":   len(story.Chapters),
			"reads":          readLabel(story.ReadCount),
			"readsCount":     story.ReadCount,
			"likesCount":     story.LikesCount,
			"bookmarksCount": story.BookmarksCount,
			"sharesCount":    story.SharesCount,
			"commentsCount":  story.CommentsCount,
			"status":         storyStatusLabel(story.Status),
			"updatedAt":      story.UpdatedAt,
		})
	}
	followersList, err := s.relationships(ctx, bson.M{"followeeUserId": userID}, "followerUserId", userID)
	if err != nil {
		return nil, err
	}
	followingList, err := s.relationships(ctx, bson.M{"followerUserId": userID}, "followeeUserId", userID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"user": userPayload(*u),
		"metrics": map[string]any{
			"publishedStories": published,
			"totalChapters":    totalChapters,
			"totalReads":       totalReads,
			"anonymousPosts":   anonymousSent,
			"followers":        followers,
			"following":        following,
		},
		"stories": storyRows,
		"activity": []map[string]any{
			{"title": "Anonymous inbox", "detail": pluralCount(anonymousInbox, "anonymous message") + " received.", "time": "Live"},
			{"title": "Anonymous posts sent", "detail": pluralCount(anonymousSent, "anonymous message") + " created.", "time": "Live"},
			{"title": "Active sessions", "detail": pluralCount(activeSessions, "active session") + " on your account.", "time": "Live"},
		},
		"followersList": followersList,
		"followingList": followingList,
	}, nil
}

func (s *Service) Update(ctx context.Context, userID bson.ObjectID, input UpdateInput) (map[string]any, error) {
	set := bson.M{"updatedAt": time.Now()}
	if input.FullName != "" {
		set["fullName"] = input.FullName
	}
	if input.Username != "" {
		username := strings.ToLower(strings.TrimSpace(input.Username))
		count, err := s.db.Collection("users").CountDocuments(ctx, bson.M{"_id": bson.M{"$ne": userID}, "username": username})
		if err != nil {
			return nil, err
		}
		if count > 0 {
			return nil, apperror.Conflict("Username already exists", "USERNAME_TAKEN", nil)
		}
		set["username"] = username
	}
	set["bio"] = input.Bio
	set["location"] = input.Location
	set["avatarUrl"] = input.AvatarURL
	if input.ProfileVisibility != "" {
		set["profileVisibility"] = input.ProfileVisibility
	}
	if input.DefaultStoryVisibility != "" {
		set["defaultStoryVisibility"] = input.DefaultStoryVisibility
	}
	if input.AllowCommentsByDefault != nil {
		set["allowCommentsByDefault"] = *input.AllowCommentsByDefault
	}
	if input.AllowHelpRequests != nil {
		set["allowHelpRequests"] = *input.AllowHelpRequests
	}
	if input.HideReadCounts != nil {
		set["hideReadCounts"] = *input.HideReadCounts
	}
	if input.ShowAnonymousActivity != nil {
		set["showAnonymousActivity"] = *input.ShowAnonymousActivity
	}
	_, err := s.db.Collection("users").UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": set})
	if err != nil {
		return nil, err
	}
	u, err := s.user(ctx, userID)
	if err != nil {
		return nil, err
	}
	_, _ = s.db.Collection("stories").UpdateMany(ctx, bson.M{"authorId": userID, "anonymous": false}, bson.M{"$set": bson.M{"authorName": u.FullName, "authorUsername": u.Username, "updatedAt": time.Now()}})
	return map[string]any{"user": userPayload(*u)}, nil
}

func (s *Service) Sessions(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	cursor, err := s.db.Collection("sessions").Find(ctx, bson.M{"userId": userID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(50))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var rows []bson.M
	if err := cursor.All(ctx, &rows); err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		id, _ := row["_id"].(bson.ObjectID)
		out = append(out, map[string]any{
			"id":         id.Hex(),
			"userAgent":  row["userAgent"],
			"ipAddress":  row["ipAddress"],
			"createdAt":  row["createdAt"],
			"lastSeenAt": row["lastSeenAt"],
			"revokedAt":  row["revokedAt"],
			"active":     row["revokedAt"] == nil,
		})
	}
	return out, nil
}

func (s *Service) RevokeSession(ctx context.Context, userID bson.ObjectID, sessionID bson.ObjectID) (map[string]any, error) {
	_, err := s.db.Collection("sessions").UpdateOne(ctx, bson.M{"_id": sessionID, "userId": userID}, bson.M{"$set": bson.M{"revokedAt": time.Now(), "updatedAt": time.Now()}})
	if err != nil {
		return nil, err
	}
	var row bson.M
	if err := s.db.Collection("sessions").FindOne(ctx, bson.M{"_id": sessionID, "userId": userID}).Decode(&row); err != nil {
		return nil, apperror.NotFound("Session not found")
	}
	return sessionPayload(row), nil
}

func (s *Service) PushPublicKey() map[string]any {
	if s.cfg.VAPIDPublicKey == "" {
		return map[string]any{"publicKey": nil}
	}
	return map[string]any{"publicKey": s.cfg.VAPIDPublicKey}
}

func (s *Service) ToggleFollow(ctx context.Context, followerID bson.ObjectID, username string) (FollowResult, error) {
	target := user.User{}
	err := s.db.Collection("users").FindOne(ctx, bson.M{"username": username}).Decode(&target)
	if err == mongo.ErrNoDocuments {
		return FollowResult{}, apperror.NotFound("User not found")
	}
	if err != nil {
		return FollowResult{}, err
	}
	if target.ID == followerID {
		return FollowResult{}, apperror.BadRequest("You cannot follow yourself.")
	}
	return s.toggleFollowTargetWithUser(ctx, followerID, target)
}

func (s *Service) ToggleStoryAuthorFollow(ctx context.Context, followerID bson.ObjectID, storyID bson.ObjectID) (FollowResult, error) {
	var story storydomain.Story
	if err := s.db.Collection("stories").FindOne(ctx, bson.M{"_id": storyID}).Decode(&story); err != nil {
		return FollowResult{}, apperror.NotFound("Story not found")
	}
	return s.toggleFollowTarget(ctx, followerID, story.AuthorID)
}

func (s *Service) Devices(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	cur, err := s.db.Collection("trusteddevices").Find(ctx, bson.M{"userId": userID}, options.Find().SetSort(bson.D{{Key: "lastSeenAt", Value: -1}}).SetLimit(30))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		return nil, err
	}
	keys := make([]any, 0, len(rows))
	for _, row := range rows {
		if key, _ := row["deviceKeyHash"].(string); key != "" {
			keys = append(keys, key)
		}
	}
	pushEnabled := map[string]bool{}
	if len(keys) > 0 {
		pushCur, err := s.db.Collection("pushsubscriptions").Find(ctx, bson.M{"userId": userID, "revokedAt": nil, "deviceKeyHash": bson.M{"$in": keys}})
		if err != nil {
			return nil, err
		}
		var subs []bson.M
		if err := pushCur.All(ctx, &subs); err != nil {
			_ = pushCur.Close(ctx)
			return nil, err
		}
		_ = pushCur.Close(ctx)
		for _, sub := range subs {
			if key, _ := sub["deviceKeyHash"].(string); key != "" {
				pushEnabled[key] = true
			}
		}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		payload := devicePayload(row)
		key, _ := row["deviceKeyHash"].(string)
		payload["pushEnabled"] = pushEnabled[key]
		out = append(out, payload)
	}
	return out, nil
}

func (s *Service) RenameDevice(ctx context.Context, userID bson.ObjectID, deviceID bson.ObjectID, input DeviceRenameInput) (map[string]any, error) {
	label := strings.TrimSpace(input.Label)
	if len(label) < 2 || len(label) > 80 {
		return nil, apperror.BadRequest("Device label must be between 2 and 80 characters.")
	}
	if _, err := s.db.Collection("trusteddevices").UpdateOne(ctx, bson.M{"_id": deviceID, "userId": userID}, bson.M{"$set": bson.M{"label": label, "updatedAt": time.Now()}}); err != nil {
		return nil, err
	}
	var row bson.M
	if err := s.db.Collection("trusteddevices").FindOne(ctx, bson.M{"_id": deviceID, "userId": userID}).Decode(&row); err != nil {
		return nil, apperror.NotFound("Device not found")
	}
	return devicePayload(row), nil
}

func (s *Service) RevokeDevice(ctx context.Context, userID bson.ObjectID, deviceID bson.ObjectID) (map[string]any, error) {
	now := time.Now()
	if _, err := s.db.Collection("trusteddevices").UpdateOne(ctx, bson.M{"_id": deviceID, "userId": userID}, bson.M{"$set": bson.M{"revokedAt": now, "updatedAt": now}}); err != nil {
		return nil, err
	}
	var row bson.M
	if err := s.db.Collection("trusteddevices").FindOne(ctx, bson.M{"_id": deviceID, "userId": userID}).Decode(&row); err != nil {
		return nil, apperror.NotFound("Device not found")
	}
	key, _ := row["deviceKeyHash"].(string)
	if key != "" {
		_, _ = s.db.Collection("sessions").UpdateMany(ctx, bson.M{"userId": userID, "deviceKeyHash": key, "revokedAt": nil}, bson.M{"$set": bson.M{"revokedAt": now, "updatedAt": now}})
		_, _ = s.db.Collection("pushsubscriptions").UpdateMany(ctx, bson.M{"userId": userID, "deviceKeyHash": key, "revokedAt": nil}, bson.M{"$set": bson.M{"revokedAt": now, "updatedAt": now}})
	}
	payload := devicePayload(row)
	payload["pushEnabled"] = false
	return payload, nil
}

func (s *Service) SavePushSubscription(ctx context.Context, userID bson.ObjectID, input PushSubscriptionInput, userAgent string) error {
	if strings.TrimSpace(input.Subscription.Endpoint) == "" || input.Subscription.Keys.P256DH == "" || input.Subscription.Keys.Auth == "" {
		return apperror.BadRequest("Push subscription is incomplete.")
	}
	now := time.Now()
	key := hashDeviceKey(input.DeviceID)
	_, err := s.db.Collection("pushsubscriptions").UpdateOne(ctx, bson.M{"endpoint": input.Subscription.Endpoint}, bson.M{"$set": bson.M{
		"userId":         userID,
		"deviceKeyHash":  key,
		"endpoint":       input.Subscription.Endpoint,
		"expirationTime": input.Subscription.ExpirationTime,
		"p256dh":         input.Subscription.Keys.P256DH,
		"auth":           input.Subscription.Keys.Auth,
		"userAgent":      userAgent,
		"lastSeenAt":     now,
		"revokedAt":      nil,
		"updatedAt":      now,
	}, "$setOnInsert": bson.M{"createdAt": now}}, options.UpdateOne().SetUpsert(true))
	if err != nil {
		return err
	}
	_, _ = s.db.Collection("trusteddevices").UpdateOne(ctx, bson.M{"userId": userID, "deviceKeyHash": key}, bson.M{"$set": bson.M{"label": first(input.DeviceName, "Trusted device"), "userAgent": userAgent, "lastSeenAt": now, "updatedAt": now}, "$setOnInsert": bson.M{"approvedAt": now, "createdAt": now}}, options.UpdateOne().SetUpsert(true))
	return nil
}

func (s *Service) DeletePushSubscription(ctx context.Context, userID bson.ObjectID, input PushSubscriptionDeleteInput) error {
	if strings.TrimSpace(input.Endpoint) == "" {
		return apperror.BadRequest("Endpoint is required.")
	}
	_, err := s.db.Collection("pushsubscriptions").UpdateMany(ctx, bson.M{"userId": userID, "endpoint": input.Endpoint}, bson.M{"$set": bson.M{"revokedAt": time.Now(), "updatedAt": time.Now()}})
	return err
}

func (s *Service) Invites(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	return s.listInvites(ctx, bson.M{"ownerUserId": userID}, false)
}

func (s *Service) IncomingInvites(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	u, err := s.user(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, apperror.NotFound("User not found")
	}
	return s.listInvites(ctx, bson.M{"email": strings.ToLower(u.Email), "status": bson.M{"$in": bson.A{"pending", "accepted"}}}, true)
}

func (s *Service) CreateInvite(ctx context.Context, userID bson.ObjectID, input InviteInput) (map[string]any, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	circle := strings.ToLower(strings.TrimSpace(input.Circle))
	if email == "" || (circle != "family" && circle != "friend") {
		return nil, apperror.BadRequest("Invite needs an email and a valid circle.")
	}
	storyID, err := bson.ObjectIDFromHex(input.StoryID)
	if err != nil {
		return nil, apperror.BadRequest("Story not found")
	}
	owner, err := s.user(ctx, userID)
	if err != nil || owner == nil {
		return nil, apperror.NotFound("User not found")
	}
	var story storydomain.Story
	if err := s.db.Collection("stories").FindOne(ctx, bson.M{"_id": storyID, "authorId": userID}).Decode(&story); err != nil {
		return nil, apperror.NotFound("Story not found")
	}
	var recipient user.User
	recipientID := any(nil)
	if err := s.db.Collection("users").FindOne(ctx, bson.M{"email": email}).Decode(&recipient); err == nil {
		if recipient.ID == userID {
			return nil, apperror.BadRequest("You cannot invite yourself to collaborate.")
		}
		for _, collaborator := range story.Collaborators {
			if collaborator.UserID == recipient.ID {
				return nil, apperror.BadRequest("That user is already collaborating on this story.")
			}
		}
		recipientID = recipient.ID
	}
	existing, err := s.db.Collection("contributorinvites").CountDocuments(ctx, bson.M{"ownerUserId": userID, "email": email, "storyId": storyID, "status": bson.M{"$in": bson.A{"pending", "accepted"}}})
	if err != nil {
		return nil, err
	}
	if existing > 0 {
		return nil, apperror.BadRequest("A collaboration invite already exists for this person on this story.")
	}
	now := time.Now()
	doc := bson.M{"_id": bson.NewObjectID(), "ownerUserId": userID, "ownerName": owner.FullName, "ownerUsername": owner.Username, "email": email, "recipientUserId": recipientID, "circle": circle, "storyId": story.ID, "storyTitle": s.storyTitle(story), "storySlug": story.Slug, "status": "pending", "createdAt": now, "updatedAt": now}
	if _, err := s.db.Collection("contributorinvites").InsertOne(ctx, doc); err != nil {
		return nil, err
	}
	return invitePayload(doc, false), nil
}

func (s *Service) AcceptInvite(ctx context.Context, userID bson.ObjectID, inviteID bson.ObjectID) (map[string]any, error) {
	u, err := s.user(ctx, userID)
	if err != nil || u == nil {
		return nil, apperror.NotFound("User not found")
	}
	var invite bson.M
	if err := s.db.Collection("contributorinvites").FindOne(ctx, bson.M{"_id": inviteID, "email": strings.ToLower(u.Email), "status": bson.M{"$in": bson.A{"pending", "accepted"}}}).Decode(&invite); err != nil {
		return nil, apperror.NotFound("Collaboration invite not found")
	}
	storyID, _ := invite["storyId"].(bson.ObjectID)
	var story storydomain.Story
	if err := s.db.Collection("stories").FindOne(ctx, bson.M{"_id": storyID}).Decode(&story); err != nil {
		return nil, apperror.NotFound("Story not found")
	}
	if story.AuthorID == userID {
		return nil, apperror.BadRequest("You already own this story.")
	}
	already := false
	for _, collaborator := range story.Collaborators {
		if collaborator.UserID == userID {
			already = true
			break
		}
	}
	now := time.Now()
	if !already {
		ownerID, _ := invite["ownerUserId"].(bson.ObjectID)
		collaborator := bson.M{"userId": userID, "fullName": u.FullName, "username": u.Username, "invitedByUserId": ownerID, "joinedAt": now}
		if _, err := s.db.Collection("stories").UpdateOne(ctx, bson.M{"_id": storyID}, bson.M{"$push": bson.M{"collaborators": collaborator}, "$set": bson.M{"updatedAt": now}}); err != nil {
			return nil, err
		}
	}
	_, err = s.db.Collection("contributorinvites").UpdateOne(ctx, bson.M{"_id": inviteID}, bson.M{"$set": bson.M{"recipientUserId": userID, "status": "accepted", "acceptedAt": now, "updatedAt": now}})
	if err != nil {
		return nil, err
	}
	var updated bson.M
	if err := s.db.Collection("contributorinvites").FindOne(ctx, bson.M{"_id": inviteID}).Decode(&updated); err != nil {
		return nil, err
	}
	return invitePayload(updated, true), nil
}

func (s *Service) RevokeInvite(ctx context.Context, userID bson.ObjectID, inviteID bson.ObjectID) (map[string]any, error) {
	_, err := s.db.Collection("contributorinvites").UpdateOne(ctx, bson.M{"_id": inviteID, "ownerUserId": userID}, bson.M{"$set": bson.M{"status": "revoked", "updatedAt": time.Now()}})
	if err != nil {
		return nil, err
	}
	var invite bson.M
	if err := s.db.Collection("contributorinvites").FindOne(ctx, bson.M{"_id": inviteID, "ownerUserId": userID}).Decode(&invite); err != nil {
		return nil, apperror.NotFound("Invite not found")
	}
	return invitePayload(invite, false), nil
}

func (s *Service) SavedStories(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	cur, err := s.db.Collection("storyinteractions").Find(ctx, bson.M{"userId": userID, "kind": "bookmark"}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100))
	if err != nil {
		return nil, err
	}
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		_ = cur.Close(ctx)
		return nil, err
	}
	_ = cur.Close(ctx)
	storyIDs := bson.A{}
	for _, row := range rows {
		if storyID, ok := row["storyId"].(bson.ObjectID); ok {
			storyIDs = append(storyIDs, storyID)
		}
	}
	if len(storyIDs) == 0 {
		return []map[string]any{}, nil
	}
	stories, err := s.stories(ctx, bson.M{"_id": bson.M{"$in": storyIDs}}, 100)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(stories))
	for _, story := range stories {
		out = append(out, map[string]any{"id": story.ID.Hex(), "slug": story.Slug, "title": s.storyTitle(story), "authorName": story.AuthorName, "authorUsername": story.AuthorUsername, "updatedAt": story.UpdatedAt})
	}
	return out, nil
}

func (s *Service) RequestVerification(ctx context.Context, userID bson.ObjectID) (map[string]any, error) {
	u, err := s.user(ctx, userID)
	if err != nil || u == nil {
		return nil, apperror.NotFound("User not found")
	}
	if !u.EmailVerified {
		return nil, apperror.BadRequest("Verify your email before requesting a blue tick.")
	}
	now := time.Now()
	_, err = s.db.Collection("users").UpdateOne(ctx, bson.M{"_id": userID}, bson.M{"$set": bson.M{"verificationStatus": "verified", "verifiedAt": now, "verificationRequestedAt": now, "updatedAt": now}})
	if err != nil {
		return nil, err
	}
	return map[string]any{"verificationStatus": "verified", "verifiedAt": now}, nil
}

func (s *Service) Followers(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	return s.relationships(ctx, bson.M{"followeeUserId": userID}, "followerUserId", userID)
}

func (s *Service) Following(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	return s.relationships(ctx, bson.M{"followerUserId": userID}, "followeeUserId", userID)
}

func (s *Service) toggleFollowTarget(ctx context.Context, followerID, targetID bson.ObjectID) (FollowResult, error) {
	var target user.User
	if err := s.db.Collection("users").FindOne(ctx, bson.M{"_id": targetID}).Decode(&target); err != nil {
		return FollowResult{}, apperror.NotFound("User not found")
	}
	return s.toggleFollowTargetWithUser(ctx, followerID, target)
}

func (s *Service) toggleFollowTargetWithUser(ctx context.Context, followerID bson.ObjectID, target user.User) (FollowResult, error) {
	if target.ID == followerID {
		return FollowResult{}, apperror.BadRequest("You cannot follow yourself")
	}
	var follower user.User
	if err := s.db.Collection("users").FindOne(ctx, bson.M{"_id": followerID}).Decode(&follower); err != nil {
		return FollowResult{}, apperror.NotFound("User not found")
	}
	filter := bson.M{"followerUserId": followerID, "followeeUserId": target.ID}
	count, err := s.db.Collection("follows").CountDocuments(ctx, filter)
	if err != nil {
		return FollowResult{}, err
	}
	active := false
	if count > 0 {
		_, err = s.db.Collection("follows").DeleteOne(ctx, filter)
	} else {
		_, err = s.db.Collection("follows").InsertOne(ctx, bson.M{"followerUserId": followerID, "followeeUserId": target.ID, "createdAt": time.Now(), "updatedAt": time.Now()})
		active = true
	}
	if err != nil {
		return FollowResult{}, err
	}
	return FollowResult{
		Username:       target.Username,
		Active:         active,
		Following:      active,
		FollowerUserID: follower.ID.Hex(),
		FollowerName:   follower.FullName,
		FollowerHandle: follower.Username,
		TargetUserID:   target.ID.Hex(),
		TargetName:     target.FullName,
		TargetUsername: target.Username,
	}, nil
}

func (s *Service) SendPushNotification(ctx context.Context, userID string, title string, body string, path string) {
	if s.cfg.VAPIDPublicKey == "" || s.cfg.VAPIDPrivateKey == "" {
		return
	}
	recipientID, err := bson.ObjectIDFromHex(strings.TrimSpace(userID))
	if err != nil {
		return
	}
	payload, err := json.Marshal(map[string]any{
		"title": title,
		"body":  body,
		"tag":   "histora-alert",
		"data":  map[string]string{"url": first(path, "/")},
	})
	if err != nil {
		return
	}
	cur, err := s.db.Collection("pushsubscriptions").Find(ctx, bson.M{"userId": recipientID, "revokedAt": nil})
	if err != nil {
		return
	}
	defer cur.Close(ctx)
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		return
	}
	for _, row := range rows {
		endpoint := fallbackString(row["endpoint"], "")
		p256dh := fallbackString(row["p256dh"], "")
		auth := fallbackString(row["auth"], "")
		if endpoint == "" || p256dh == "" || auth == "" {
			continue
		}
		subscription := &webpush.Subscription{
			Endpoint: endpoint,
			Keys: webpush.Keys{
				P256dh: p256dh,
				Auth:   auth,
			},
		}
		pushCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		response, err := webpush.SendNotificationWithContext(pushCtx, payload, subscription, &webpush.Options{
			Subscriber:      first(s.cfg.VAPIDSubject, "mailto:security@histora.app"),
			VAPIDPublicKey:  s.cfg.VAPIDPublicKey,
			VAPIDPrivateKey: s.cfg.VAPIDPrivateKey,
			TTL:             60,
		})
		cancel()
		if response != nil {
			_ = response.Body.Close()
			if response.StatusCode == http.StatusGone || response.StatusCode == http.StatusNotFound {
				_, _ = s.db.Collection("pushsubscriptions").UpdateOne(ctx, bson.M{"endpoint": endpoint}, bson.M{"$set": bson.M{"revokedAt": time.Now(), "updatedAt": time.Now()}})
			}
		}
		if err != nil && errors.Is(err, context.Canceled) {
			return
		}
	}
}

func (s *Service) user(ctx context.Context, id bson.ObjectID) (*user.User, error) {
	var u user.User
	err := s.db.Collection("users").FindOne(ctx, bson.M{"_id": id}).Decode(&u)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &u, err
}

func userPayload(u user.User) map[string]any {
	verificationStatus := first(u.VerificationStatus, "none")
	if u.Verified {
		verificationStatus = "verified"
	}
	profileVisibility := first(u.ProfileVisibility, "public")
	defaultStoryVisibility := first(u.DefaultStoryVisibility, "selected")
	return map[string]any{
		"id": u.ID.Hex(), "fullName": u.FullName, "username": u.Username, "email": u.Email,
		"bio": u.Bio, "location": u.Location, "avatarUrl": u.AvatarURL, "subscriptionTier": u.SubscriptionTier,
		"defaultStoryVisibility": defaultStoryVisibility, "allowCommentsByDefault": u.AllowCommentsByDefault,
		"allowHelpRequests": u.AllowHelpRequests, "hideReadCounts": u.HideReadCounts, "showAnonymousActivity": u.ShowAnonymousActivity,
		"profileVisibility": profileVisibility, "emailVerified": u.EmailVerified, "verified": u.Verified,
		"verificationStatus": verificationStatus, "verifiedAt": u.VerifiedAt,
	}
}

func (s *Service) stories(ctx context.Context, filter bson.M, limit int64) ([]storydomain.Story, error) {
	cur, err := s.db.Collection("stories").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetLimit(limit))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var stories []storydomain.Story
	return stories, cur.All(ctx, &stories)
}

func (s *Service) storyTitle(story storydomain.Story) string {
	if story.ContentEncrypted != "" {
		if decrypted, err := cryptoutil.DecryptJSON[storyTextContent](s.cfg.DataEncryptionKey, story.ContentEncrypted); err == nil && decrypted != nil && decrypted.Title != "" {
			return decrypted.Title
		}
	}
	if story.Title != "" && story.Title != cryptoutil.EncryptedContentPlaceholder {
		return story.Title
	}
	return "Untitled story"
}

func (s *Service) relationships(ctx context.Context, filter bson.M, relatedField string, viewerID bson.ObjectID) ([]map[string]any, error) {
	cur, err := s.db.Collection("follows").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100))
	if err != nil {
		return nil, err
	}
	var follows []bson.M
	if err := cur.All(ctx, &follows); err != nil {
		_ = cur.Close(ctx)
		return nil, err
	}
	_ = cur.Close(ctx)
	out := make([]map[string]any, 0, len(follows))
	for _, follow := range follows {
		relatedID, ok := follow[relatedField].(bson.ObjectID)
		if !ok {
			continue
		}
		var related user.User
		if err := s.db.Collection("users").FindOne(ctx, bson.M{"_id": relatedID}).Decode(&related); err != nil {
			continue
		}
		followingBack := relatedField == "followeeUserId"
		if relatedField == "followerUserId" {
			count, _ := s.db.Collection("follows").CountDocuments(ctx, bson.M{"followerUserId": viewerID, "followeeUserId": relatedID})
			followingBack = count > 0
		}
		out = append(out, map[string]any{"id": related.ID.Hex(), "fullName": related.FullName, "username": related.Username, "avatarUrl": related.AvatarURL, "verified": related.Verified, "followedAt": follow["createdAt"], "followingBack": followingBack})
	}
	return out, nil
}

func (s *Service) listInvites(ctx context.Context, filter bson.M, incoming bool) ([]map[string]any, error) {
	cur, err := s.db.Collection("contributorinvites").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetLimit(50))
	if err != nil {
		return nil, err
	}
	var rows []bson.M
	if err := cur.All(ctx, &rows); err != nil {
		_ = cur.Close(ctx)
		return nil, err
	}
	_ = cur.Close(ctx)
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		out = append(out, invitePayload(row, incoming))
	}
	return out, nil
}

func sessionPayload(row bson.M) map[string]any {
	id, _ := row["_id"].(bson.ObjectID)
	return map[string]any{"id": id.Hex(), "userAgent": fallbackString(row["userAgent"], "Unknown device"), "ipAddress": row["ipAddress"], "createdAt": row["createdAt"], "lastSeenAt": row["lastSeenAt"], "revokedAt": row["revokedAt"], "active": row["revokedAt"] == nil}
}

func devicePayload(row bson.M) map[string]any {
	id, _ := row["_id"].(bson.ObjectID)
	return map[string]any{"id": id.Hex(), "label": fallbackString(row["label"], "Trusted device"), "userAgent": fallbackString(row["userAgent"], "Unknown device"), "ipAddress": row["lastIpAddress"], "approvedAt": row["approvedAt"], "lastSeenAt": row["lastSeenAt"], "revokedAt": row["revokedAt"], "active": row["revokedAt"] == nil}
}

func invitePayload(row bson.M, incoming bool) map[string]any {
	id, _ := row["_id"].(bson.ObjectID)
	storyID, _ := row["storyId"].(bson.ObjectID)
	status, _ := row["status"].(string)
	if incoming {
		return map[string]any{"id": id.Hex(), "ownerName": row["ownerName"], "ownerUsername": row["ownerUsername"], "circle": row["circle"], "storyId": storyID.Hex(), "storyTitle": row["storyTitle"], "storySlug": row["storySlug"], "status": status, "createdAt": row["createdAt"], "acceptedAt": row["acceptedAt"]}
	}
	return map[string]any{"id": id.Hex(), "email": row["email"], "circle": row["circle"], "storyId": storyID.Hex(), "story": row["storyTitle"], "status": titleCase(status), "createdAt": row["createdAt"], "deliveryState": "app_only"}
}

func hashDeviceKey(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func chapterLabel(count int) string {
	if count == 1 {
		return "1 chapter"
	}
	return strconv.Itoa(count) + " chapters"
}

func readLabel(count int64) string {
	if count == 1 {
		return "1 read"
	}
	return pluralCount(count, "read")
}

func pluralCount(count int64, label string) string {
	suffix := "s"
	if count == 1 {
		suffix = ""
	}
	return strings.TrimSpace(strings.Join([]string{strconvFormat(count), label + suffix}, " "))
}

func storyStatusLabel(status string) string {
	if status == "published" {
		return "Live"
	}
	return "Draft"
}

func titleCase(value string) string {
	if value == "" {
		return value
	}
	return strings.ToUpper(value[:1]) + value[1:]
}

func fallbackString(value any, fallback string) string {
	if str, ok := value.(string); ok && str != "" {
		return str
	}
	return fallback
}

func first(value, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func strconvFormat(value int64) string {
	return strconv.FormatInt(value, 10)
}
