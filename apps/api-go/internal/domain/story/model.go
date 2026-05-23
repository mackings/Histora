package story

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Collaborator struct {
	UserID   bson.ObjectID `bson:"userId" json:"id"`
	FullName string        `bson:"fullName" json:"fullName"`
	Username string        `bson:"username" json:"username"`
	JoinedAt time.Time     `bson:"joinedAt" json:"joinedAt"`
}

type ExternalLink struct {
	Label string `bson:"label" json:"label"`
	URL   string `bson:"url" json:"url"`
	Kind  string `bson:"kind" json:"kind"`
}

type Moment struct {
	ID                   string    `bson:"id,omitempty" json:"id,omitempty"`
	Title                string    `bson:"title" json:"title"`
	Description          string    `bson:"description" json:"description"`
	HappenedAt           time.Time `bson:"happenedAt" json:"happenedAt"`
	ImageURLs            []string  `bson:"imageUrls,omitempty" json:"imageUrls"`
	VoiceNoteURL         string    `bson:"voiceNoteUrl,omitempty" json:"voiceNoteUrl,omitempty"`
	CreatedByName        string    `bson:"createdByName,omitempty" json:"createdByName,omitempty"`
	CreatedByUsername    string    `bson:"createdByUsername,omitempty" json:"createdByUsername,omitempty"`
	CreatedAt            time.Time `bson:"createdAt,omitempty" json:"createdAt,omitempty"`
	LastEditedByName     string    `bson:"lastEditedByName,omitempty" json:"lastEditedByName,omitempty"`
	LastEditedByUsername string    `bson:"lastEditedByUsername,omitempty" json:"lastEditedByUsername,omitempty"`
	LastEditedAt         time.Time `bson:"lastEditedAt,omitempty" json:"lastEditedAt,omitempty"`
}

type Chapter struct {
	ID                   string    `bson:"id,omitempty" json:"id,omitempty"`
	Title                string    `bson:"title" json:"title"`
	Body                 string    `bson:"body" json:"body"`
	Type                 string    `bson:"type" json:"type"`
	Order                int       `bson:"order" json:"order"`
	ImageURLs            []string  `bson:"imageUrls,omitempty" json:"imageUrls"`
	VoiceNoteURL         string    `bson:"voiceNoteUrl,omitempty" json:"voiceNoteUrl,omitempty"`
	Moments              []Moment  `bson:"moments,omitempty" json:"moments"`
	CreatedByName        string    `bson:"createdByName,omitempty" json:"createdByName,omitempty"`
	CreatedByUsername    string    `bson:"createdByUsername,omitempty" json:"createdByUsername,omitempty"`
	CreatedAt            time.Time `bson:"createdAt,omitempty" json:"createdAt,omitempty"`
	LastEditedByName     string    `bson:"lastEditedByName,omitempty" json:"lastEditedByName,omitempty"`
	LastEditedByUsername string    `bson:"lastEditedByUsername,omitempty" json:"lastEditedByUsername,omitempty"`
	LastEditedAt         time.Time `bson:"lastEditedAt,omitempty" json:"lastEditedAt,omitempty"`
}

type Story struct {
	ID                    bson.ObjectID   `bson:"_id,omitempty" json:"id"`
	Slug                  string          `bson:"slug" json:"slug"`
	Status                string          `bson:"status" json:"status"`
	Title                 string          `bson:"title" json:"title"`
	Summary               string          `bson:"summary" json:"summary"`
	ContentEncrypted      string          `bson:"contentEncrypted,omitempty" json:"-"`
	CoverImageURL         string          `bson:"coverImageUrl,omitempty" json:"coverImageUrl,omitempty"`
	Visibility            string          `bson:"visibility" json:"visibility"`
	Anonymous             bool            `bson:"anonymous" json:"anonymous"`
	AllowedViewerIDs      []bson.ObjectID `bson:"allowedViewerIds,omitempty" json:"allowedViewerIds,omitempty"`
	AuthorID              bson.ObjectID   `bson:"authorId" json:"authorId"`
	AuthorName            string          `bson:"authorName" json:"authorName"`
	AuthorUsername        string          `bson:"authorUsername" json:"authorUsername"`
	Collaborators         []Collaborator  `bson:"collaborators,omitempty" json:"collaborators"`
	CollaborationRevision int             `bson:"collaborationRevision" json:"collaborationRevision"`
	LastEditedByUserID    bson.ObjectID   `bson:"lastEditedByUserId,omitempty" json:"lastEditedByUserId,omitempty"`
	LastEditedByName      string          `bson:"lastEditedByName,omitempty" json:"lastEditedByName,omitempty"`
	LastEditedByUsername  string          `bson:"lastEditedByUsername,omitempty" json:"lastEditedByUsername,omitempty"`
	LastEditedAt          time.Time       `bson:"lastEditedAt,omitempty" json:"lastEditedAt,omitempty"`
	Tags                  []string        `bson:"tags,omitempty" json:"tags"`
	Links                 []ExternalLink  `bson:"links,omitempty" json:"links"`
	Chapters              []Chapter       `bson:"chapters,omitempty" json:"chapters"`
	ReadCount             int64           `bson:"readCount" json:"readCount"`
	ReactionsCount        int64           `bson:"reactionsCount" json:"reactionsCount"`
	LikesCount            int64           `bson:"likesCount" json:"likesCount"`
	BookmarksCount        int64           `bson:"bookmarksCount" json:"bookmarksCount"`
	SharesCount           int64           `bson:"sharesCount" json:"sharesCount"`
	CommentsCount         int64           `bson:"commentsCount" json:"commentsCount"`
	CreatedAt             time.Time       `bson:"createdAt" json:"createdAt"`
	UpdatedAt             time.Time       `bson:"updatedAt" json:"updatedAt"`
}
