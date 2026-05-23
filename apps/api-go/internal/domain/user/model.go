package user

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type User struct {
	ID                      bson.ObjectID   `bson:"_id,omitempty" json:"id"`
	FullName                string          `bson:"fullName" json:"fullName"`
	Username                string          `bson:"username" json:"username"`
	Email                   string          `bson:"email" json:"email"`
	PasswordHash            string          `bson:"passwordHash,omitempty" json:"-"`
	Bio                     string          `bson:"bio,omitempty" json:"bio"`
	Location                string          `bson:"location,omitempty" json:"location"`
	AvatarURL               string          `bson:"avatarUrl,omitempty" json:"avatarUrl"`
	SubscriptionTier        string          `bson:"subscriptionTier" json:"subscriptionTier"`
	DefaultStoryVisibility  string          `bson:"defaultStoryVisibility" json:"defaultStoryVisibility"`
	AllowCommentsByDefault  bool            `bson:"allowCommentsByDefault" json:"allowCommentsByDefault"`
	SelectedViewerIDs       []bson.ObjectID `bson:"selectedViewerIds,omitempty" json:"selectedViewerIds,omitempty"`
	EmailVerified           bool            `bson:"emailVerified" json:"emailVerified"`
	Verified                bool            `bson:"verified" json:"verified"`
	VerificationRequestedAt *time.Time      `bson:"verificationRequestedAt,omitempty" json:"verificationRequestedAt,omitempty"`
	CreatedAt               time.Time       `bson:"createdAt" json:"createdAt"`
	UpdatedAt               time.Time       `bson:"updatedAt" json:"updatedAt"`
}
