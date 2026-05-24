package status

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Status struct {
	ID             bson.ObjectID   `bson:"_id,omitempty" json:"id"`
	AuthorID       bson.ObjectID   `bson:"authorId" json:"authorId"`
	AuthorName     string          `bson:"authorName" json:"authorName"`
	AuthorUsername string          `bson:"authorUsername" json:"authorUsername"`
	Body           string          `bson:"body" json:"body"`
	BodyEncrypted  string          `bson:"bodyEncrypted,omitempty" json:"-"`
	Anonymous      bool            `bson:"anonymous" json:"anonymous"`
	ImageURL       string          `bson:"imageUrl,omitempty" json:"imageUrl,omitempty"`
	ImageKey       string          `bson:"imageKey,omitempty" json:"imageKey,omitempty"`
	Visibility     string          `bson:"visibility" json:"visibility"`
	AllowedUserIDs []bson.ObjectID `bson:"allowedUserIds,omitempty" json:"allowedUserIds,omitempty"`
	ShareSlug      string          `bson:"shareSlug,omitempty" json:"shareSlug,omitempty"`
	LikesCount     int64           `bson:"likesCount" json:"likesCount"`
	BookmarksCount int64           `bson:"bookmarksCount" json:"bookmarksCount"`
	CommentsCount  int64           `bson:"commentsCount" json:"commentsCount"`
	ExpiresAt      time.Time       `bson:"expiresAt" json:"expiresAt"`
	CreatedAt      time.Time       `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time       `bson:"updatedAt" json:"updatedAt"`
}
