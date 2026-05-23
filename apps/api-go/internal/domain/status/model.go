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
	MediaURLs      []string        `bson:"mediaUrls,omitempty" json:"mediaUrls"`
	Visibility     string          `bson:"visibility" json:"visibility"`
	AllowedUserIDs []bson.ObjectID `bson:"allowedUserIds,omitempty" json:"allowedUserIds,omitempty"`
	ShareSlug      string          `bson:"shareSlug,omitempty" json:"shareSlug,omitempty"`
	ReactionsCount int64           `bson:"reactionsCount" json:"reactionsCount"`
	CommentsCount  int64           `bson:"commentsCount" json:"commentsCount"`
	ExpiresAt      time.Time       `bson:"expiresAt" json:"expiresAt"`
	CreatedAt      time.Time       `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time       `bson:"updatedAt" json:"updatedAt"`
}
