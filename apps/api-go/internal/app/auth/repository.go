package auth

import (
	"context"
	"time"

	authdomain "github.com/mackings/histora/apps/api-go/internal/domain/auth"
	"github.com/mackings/histora/apps/api-go/internal/domain/session"
	"github.com/mackings/histora/apps/api-go/internal/domain/user"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Repository struct {
	users                      *mongo.Collection
	sessions                   *mongo.Collection
	emailVerificationTokens    *mongo.Collection
	passwordResetTokens        *mongo.Collection
	trustedDevices             *mongo.Collection
	deviceVerificationRequests *mongo.Collection
}

func NewRepository(db *mongo.Database) *Repository {
	return &Repository{
		users:                      db.Collection("users"),
		sessions:                   db.Collection("sessions"),
		emailVerificationTokens:    db.Collection("emailverificationtokens"),
		passwordResetTokens:        db.Collection("passwordresettokens"),
		trustedDevices:             db.Collection("trusteddevices"),
		deviceVerificationRequests: db.Collection("deviceverificationchallenges"),
	}
}

func (r *Repository) FindUserByEmail(ctx context.Context, email string) (*user.User, error) {
	var out user.User
	err := r.users.FindOne(ctx, bson.M{"email": email}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) FindUserByEmailOrUsername(ctx context.Context, email, username string) (*user.User, error) {
	var out user.User
	err := r.users.FindOne(ctx, bson.M{"$or": bson.A{bson.M{"email": email}, bson.M{"username": username}}}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) FindUserByID(ctx context.Context, id bson.ObjectID) (*user.User, error) {
	var out user.User
	err := r.users.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) CreateUser(ctx context.Context, u user.User) (*user.User, error) {
	now := time.Now()
	u.ID = bson.NewObjectID()
	u.EmailVerified = false
	u.SubscriptionTier = defaultString(u.SubscriptionTier, "free")
	u.DefaultStoryVisibility = defaultString(u.DefaultStoryVisibility, "selected")
	u.AllowCommentsByDefault = true
	u.CreatedAt = now
	u.UpdatedAt = now
	_, err := r.users.InsertOne(ctx, u)
	return &u, err
}

func (r *Repository) MarkUserEmailVerified(ctx context.Context, id bson.ObjectID) error {
	now := time.Now()
	_, err := r.users.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"emailVerified":   true,
		"emailVerifiedAt": now,
		"updatedAt":       now,
	}})
	return err
}

func (r *Repository) CreateSession(ctx context.Context, s session.Session) (*session.Session, error) {
	now := time.Now()
	s.ID = bson.NewObjectID()
	s.CreatedAt = now
	s.UpdatedAt = now
	s.LastSeenAt = now
	_, err := r.sessions.InsertOne(ctx, s)
	return &s, err
}

func (r *Repository) UpdateSessionTokenHash(ctx context.Context, id bson.ObjectID, tokenHash string) error {
	_, err := r.sessions.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"tokenHash": tokenHash,
		"updatedAt": time.Now(),
	}})
	return err
}

func (r *Repository) FindSessionByID(ctx context.Context, id bson.ObjectID) (*session.Session, error) {
	var out session.Session
	err := r.sessions.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) RevokeSession(ctx context.Context, id bson.ObjectID) error {
	now := time.Now()
	_, err := r.sessions.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"revokedAt": now, "lastSeenAt": now, "updatedAt": now}})
	return err
}

func (r *Repository) RevokeSessionFamily(ctx context.Context, family string) error {
	_, err := r.sessions.UpdateMany(ctx, bson.M{"family": family}, bson.M{"$set": bson.M{"revokedAt": time.Now(), "updatedAt": time.Now()}})
	return err
}

func (r *Repository) RevokeActiveUserSessions(ctx context.Context, userID bson.ObjectID) error {
	_, err := r.sessions.UpdateMany(ctx, bson.M{"userId": userID, "revokedAt": nil}, bson.M{"$set": bson.M{"revokedAt": time.Now(), "updatedAt": time.Now()}})
	return err
}

func (r *Repository) DeleteActiveEmailTokens(ctx context.Context, userID bson.ObjectID) error {
	_, err := r.emailVerificationTokens.DeleteMany(ctx, bson.M{"userId": userID, "consumedAt": nil})
	return err
}

func (r *Repository) CreateEmailToken(ctx context.Context, token authdomain.EmailVerificationToken) (*authdomain.EmailVerificationToken, error) {
	now := time.Now()
	token.ID = bson.NewObjectID()
	token.CreatedAt = now
	token.UpdatedAt = now
	_, err := r.emailVerificationTokens.InsertOne(ctx, token)
	return &token, err
}

func (r *Repository) FindActiveEmailToken(ctx context.Context, userID bson.ObjectID, email string) (*authdomain.EmailVerificationToken, error) {
	var out authdomain.EmailVerificationToken
	err := r.emailVerificationTokens.FindOne(ctx, bson.M{
		"userId":     userID,
		"email":      email,
		"consumedAt": nil,
		"expiresAt":  bson.M{"$gt": time.Now()},
	}, options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: -1}})).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) UpdateEmailTokenAttempt(ctx context.Context, id bson.ObjectID, failedAttempts int) error {
	_, err := r.emailVerificationTokens.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{
		"failedAttempts": failedAttempts,
		"lastAttemptAt":  time.Now(),
		"updatedAt":      time.Now(),
	}})
	return err
}

func (r *Repository) ConsumeEmailToken(ctx context.Context, id bson.ObjectID) error {
	now := time.Now()
	_, err := r.emailVerificationTokens.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"consumedAt": now, "lastAttemptAt": now, "updatedAt": now}})
	return err
}

func (r *Repository) FindTrustedDevice(ctx context.Context, userID bson.ObjectID, deviceKeyHash string) (*authdomain.TrustedDevice, error) {
	var out authdomain.TrustedDevice
	err := r.trustedDevices.FindOne(ctx, bson.M{"userId": userID, "deviceKeyHash": deviceKeyHash, "revokedAt": nil}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) UpsertTrustedDevice(ctx context.Context, device authdomain.TrustedDevice) error {
	now := time.Now()
	_, err := r.trustedDevices.UpdateOne(
		ctx,
		bson.M{"userId": device.UserID, "deviceKeyHash": device.DeviceKeyHash},
		bson.M{"$set": bson.M{
			"label":         device.Label,
			"userAgent":     device.UserAgent,
			"lastIpAddress": device.LastIPAddress,
			"approvedAt":    now,
			"lastSeenAt":    now,
			"revokedAt":     nil,
			"updatedAt":     now,
		}, "$setOnInsert": bson.M{"createdAt": now}},
		options.UpdateOne().SetUpsert(true),
	)
	return err
}

func (r *Repository) CreatePasswordResetToken(ctx context.Context, token authdomain.PasswordResetToken) (*authdomain.PasswordResetToken, error) {
	now := time.Now()
	token.ID = bson.NewObjectID()
	token.CreatedAt = now
	token.UpdatedAt = now
	_, err := r.passwordResetTokens.InsertOne(ctx, token)
	return &token, err
}

func (r *Repository) DeleteActivePasswordResetTokens(ctx context.Context, userID bson.ObjectID) error {
	_, err := r.passwordResetTokens.DeleteMany(ctx, bson.M{"userId": userID, "usedAt": nil})
	return err
}

func (r *Repository) FindActivePasswordResetTokenByHash(ctx context.Context, codeHash string) (*authdomain.PasswordResetToken, error) {
	var out authdomain.PasswordResetToken
	err := r.passwordResetTokens.FindOne(ctx, bson.M{"codeHash": codeHash, "usedAt": nil, "expiresAt": bson.M{"$gt": time.Now()}}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) ConsumePasswordResetToken(ctx context.Context, id bson.ObjectID) error {
	_, err := r.passwordResetTokens.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"usedAt": time.Now(), "updatedAt": time.Now()}})
	return err
}

func (r *Repository) UpdateUserPasswordHash(ctx context.Context, id bson.ObjectID, passwordHash string) error {
	_, err := r.users.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"passwordHash": passwordHash, "updatedAt": time.Now()}})
	return err
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
