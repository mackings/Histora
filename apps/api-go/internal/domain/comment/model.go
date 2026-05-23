package comment

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Comment struct {
	ID             bson.ObjectID  `bson:"_id,omitempty" json:"id"`
	TargetType     string         `bson:"targetType" json:"targetType"`
	TargetID       string         `bson:"targetId" json:"targetId"`
	StoryID        *bson.ObjectID `bson:"storyId,omitempty" json:"storyId,omitempty"`
	ChapterID      string         `bson:"chapterId,omitempty" json:"chapterId,omitempty"`
	AuthorID       bson.ObjectID  `bson:"authorId" json:"authorId"`
	AuthorName     string         `bson:"authorName" json:"authorName"`
	AuthorUsername string         `bson:"authorUsername" json:"authorUsername"`
	Body           string         `bson:"body" json:"body"`
	CreatedAt      time.Time      `bson:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time      `bson:"updatedAt" json:"updatedAt"`
}
