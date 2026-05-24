package anonymous

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"strings"
	"time"

	"github.com/mackings/histora/apps/api-go/internal/config"
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

func NewService(cfg config.Config, db *mongo.Database) *Service { return &Service{cfg: cfg, db: db} }

type CreateInput struct {
	RecipientUsername string `json:"recipientUsername"`
	Body              string `json:"body"`
	Distribution      string `json:"distribution"`
}
type HelpInput struct {
	HelperName  string `json:"helperName"`
	HelperPhone string `json:"helperPhone"`
}
type UnlockInput struct {
	HelperName  string `json:"helperName"`
	HelperPhone string `json:"helperPhone"`
}

func (s *Service) Create(ctx context.Context, senderID bson.ObjectID, input CreateInput) (map[string]any, error) {
	body := strings.TrimSpace(input.Body)
	if len(body) < 3 {
		return nil, apperror.BadRequest("Anonymous message is too short.")
	}
	distribution := first(input.Distribution, "external")
	if distribution != "app" && distribution != "external" {
		return nil, apperror.BadRequest("Invalid distribution.")
	}
	var recipient struct {
		ID       bson.ObjectID `bson:"_id"`
		Username string        `bson:"username"`
	}
	if err := s.db.Collection("users").FindOne(ctx, bson.M{"username": input.RecipientUsername}).Decode(&recipient); err != nil {
		return nil, apperror.NotFound("Recipient not found")
	}
	encrypted, err := cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, body)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	id := bson.NewObjectID()
	slug := "anon-" + randToken()
	doc := bson.M{"_id": id, "senderUserId": senderID, "recipientUserId": recipient.ID, "recipientUsername": recipient.Username, "body": cryptoutil.EncryptedContentPlaceholder, "bodyEncrypted": encrypted, "distribution": distribution, "shareSlug": slug, "commentsCount": 0, "helpFee": 8, "helpRequests": bson.A{}, "createdAt": now, "updatedAt": now}
	if _, err := s.db.Collection("anonymousmessages").InsertOne(ctx, doc); err != nil {
		return nil, err
	}
	return s.response(doc, false)
}

func (s *Service) Inbox(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	return s.list(ctx, bson.M{"recipientUserId": userID}, true)
}
func (s *Service) Sent(ctx context.Context, userID bson.ObjectID) ([]map[string]any, error) {
	return s.list(ctx, bson.M{"senderUserId": userID}, false)
}
func (s *Service) GetBySlug(ctx context.Context, slug string) (map[string]any, error) {
	var doc bson.M
	if err := s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"shareSlug": slug}).Decode(&doc); err != nil {
		return nil, apperror.NotFound("Anonymous message not found")
	}
	return s.response(doc, false)
}
func (s *Service) UpdateDistribution(ctx context.Context, userID bson.ObjectID, messageID bson.ObjectID, distribution string) (map[string]any, error) {
	if distribution != "app" && distribution != "external" {
		return nil, apperror.BadRequest("Invalid distribution.")
	}
	_, err := s.db.Collection("anonymousmessages").UpdateOne(ctx, bson.M{"_id": messageID, "recipientUserId": userID}, bson.M{"$set": bson.M{"distribution": distribution, "updatedAt": time.Now()}})
	if err != nil {
		return nil, err
	}
	var doc bson.M
	if err := s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"_id": messageID}).Decode(&doc); err != nil {
		return nil, apperror.NotFound("Anonymous message not found")
	}
	return s.response(doc, false)
}
func (s *Service) Delete(ctx context.Context, userID bson.ObjectID, messageID bson.ObjectID) error {
	res, err := s.db.Collection("anonymousmessages").DeleteOne(ctx, bson.M{"_id": messageID, "senderUserId": userID})
	if err != nil {
		return err
	}
	if res.DeletedCount == 0 {
		return apperror.NotFound("Anonymous message not found")
	}
	_, _ = s.db.Collection("comments").DeleteMany(ctx, bson.M{"targetType": "anonymousMessage", "targetId": messageID.Hex()})
	return nil
}
func (s *Service) RequestHelp(ctx context.Context, userID bson.ObjectID, slug string, input HelpInput) (map[string]any, error) {
	var actor struct {
		FullName string `bson:"fullName"`
		Username string `bson:"username"`
	}
	_ = s.db.Collection("users").FindOne(ctx, bson.M{"_id": userID}).Decode(&actor)
	var doc bson.M
	if err := s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"shareSlug": slug}).Decode(&doc); err != nil {
		return nil, apperror.NotFound("Anonymous message not found")
	}
	if recipientID, _ := doc["recipientUserId"].(bson.ObjectID); recipientID == userID {
		return nil, apperror.BadRequest("You cannot request to help your own anonymous message.")
	}
	for _, existing := range bsonArray(doc["helpRequests"]) {
		request, _ := existing.(bson.M)
		if requesterID, _ := request["requesterUserId"].(bson.ObjectID); requesterID == userID && request["acceptedAt"] == nil {
			return s.response(doc, false)
		}
	}
	req := bson.M{"id": "help-" + randToken(), "requesterUserId": userID, "requesterName": first(actor.FullName, input.HelperName), "requesterUsername": actor.Username, "createdAt": time.Now(), "acceptedAt": nil}
	_, err := s.db.Collection("anonymousmessages").UpdateOne(ctx, bson.M{"shareSlug": slug}, bson.M{"$push": bson.M{"helpRequests": req}, "$set": bson.M{"updatedAt": time.Now()}})
	if err != nil {
		return nil, err
	}
	_ = s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"shareSlug": slug}).Decode(&doc)
	return s.response(doc, false)
}

func (s *Service) AcceptHelp(ctx context.Context, userID bson.ObjectID, messageID bson.ObjectID, requestID string) (map[string]any, error) {
	var doc bson.M
	if err := s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"_id": messageID, "recipientUserId": userID}).Decode(&doc); err != nil {
		return nil, apperror.NotFound("Anonymous message not found")
	}
	requests := bsonArray(doc["helpRequests"])
	found := false
	now := time.Now()
	for index, item := range requests {
		request, _ := item.(bson.M)
		if request["id"] == requestID {
			request["acceptedAt"] = now
			requests[index] = request
			found = true
			name, _ := request["requesterName"].(string)
			username, _ := request["requesterUsername"].(string)
			nameEncrypted, err := cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, first(name, "Helper"))
			if err != nil {
				return nil, err
			}
			phoneEncrypted, err := cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, "@"+username)
			if err != nil {
				return nil, err
			}
			doc["helperContactNameEncrypted"] = nameEncrypted
			doc["helperContactPhoneEncrypted"] = phoneEncrypted
			break
		}
	}
	if !found {
		return nil, apperror.NotFound("Help request not found")
	}
	_, err := s.db.Collection("anonymousmessages").UpdateOne(ctx, bson.M{"_id": messageID, "recipientUserId": userID}, bson.M{"$set": bson.M{"helpRequests": requests, "helperContactNameEncrypted": doc["helperContactNameEncrypted"], "helperContactPhoneEncrypted": doc["helperContactPhoneEncrypted"], "updatedAt": now}})
	if err != nil {
		return nil, err
	}
	_ = s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"_id": messageID}).Decode(&doc)
	return s.response(doc, true)
}

func (s *Service) UnlockHelperContact(ctx context.Context, userID bson.ObjectID, messageID bson.ObjectID, input UnlockInput) (map[string]any, error) {
	name := strings.TrimSpace(input.HelperName)
	phone := strings.TrimSpace(input.HelperPhone)
	if len(name) < 2 || len(phone) < 7 {
		return nil, apperror.BadRequest("Helper contact is incomplete.")
	}
	nameEncrypted, err := cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, name)
	if err != nil {
		return nil, err
	}
	phoneEncrypted, err := cryptoutil.EncryptSensitiveValue(s.cfg.DataEncryptionKey, phone)
	if err != nil {
		return nil, err
	}
	_, err = s.db.Collection("anonymousmessages").UpdateOne(ctx, bson.M{"_id": messageID, "recipientUserId": userID}, bson.M{"$set": bson.M{"helperContactNameEncrypted": nameEncrypted, "helperContactPhoneEncrypted": phoneEncrypted, "updatedAt": time.Now()}})
	if err != nil {
		return nil, err
	}
	var doc bson.M
	if err := s.db.Collection("anonymousmessages").FindOne(ctx, bson.M{"_id": messageID, "recipientUserId": userID}).Decode(&doc); err != nil {
		return nil, apperror.NotFound("Anonymous message not found")
	}
	return s.response(doc, true)
}
func (s *Service) list(ctx context.Context, filter bson.M, includePrivate bool) ([]map[string]any, error) {
	cur, err := s.db.Collection("anonymousmessages").Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var docs []bson.M
	if err := cur.All(ctx, &docs); err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		item, err := s.response(doc, includePrivate)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}
func (s *Service) response(doc bson.M, includePrivate bool) (map[string]any, error) {
	body := ""
	if enc, _ := doc["bodyEncrypted"].(string); enc != "" {
		dec, err := cryptoutil.DecryptSensitiveValue(s.cfg.DataEncryptionKey, enc)
		if err != nil {
			return nil, err
		}
		body = dec
	}
	id, _ := doc["_id"].(bson.ObjectID)
	helperContact := any(nil)
	if includePrivate {
		nameEnc, _ := doc["helperContactNameEncrypted"].(string)
		phoneEnc, _ := doc["helperContactPhoneEncrypted"].(string)
		if nameEnc != "" && phoneEnc != "" {
			name, _ := cryptoutil.DecryptSensitiveValue(s.cfg.DataEncryptionKey, nameEnc)
			phone, _ := cryptoutil.DecryptSensitiveValue(s.cfg.DataEncryptionKey, phoneEnc)
			helperContact = map[string]string{"name": name, "phone": phone}
		}
	}
	return map[string]any{"id": id.Hex(), "recipientUsername": doc["recipientUsername"], "body": body, "shareSlug": doc["shareSlug"], "distribution": doc["distribution"], "commentsCount": doc["commentsCount"], "helpFee": doc["helpFee"], "viewerRole": nil, "canRequestHelp": !includePrivate, "helperContact": helperContact, "createdAt": doc["createdAt"], "helpRequests": func() any {
		if includePrivate {
			return doc["helpRequests"]
		}
		return []any{}
	}()}, nil
}

func bsonArray(value any) bson.A {
	if out, ok := value.(bson.A); ok {
		return out
	}
	if out, ok := value.([]any); ok {
		return bson.A(out)
	}
	return bson.A{}
}
func randToken() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}
func first(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
