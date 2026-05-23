package anonymous

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type HelpRequest struct {
	RequesterUserID bson.ObjectID `bson:"requesterUserId" json:"requesterUserId"`
	HelperName      string        `bson:"helperName" json:"helperName"`
	HelperPhone     string        `bson:"helperPhone" json:"helperPhone"`
	AcceptedAt      *time.Time    `bson:"acceptedAt,omitempty" json:"acceptedAt,omitempty"`
}

type Message struct {
	ID              bson.ObjectID  `bson:"_id,omitempty" json:"id"`
	SenderUserID    *bson.ObjectID `bson:"senderUserId,omitempty" json:"senderUserId,omitempty"`
	RecipientUserID bson.ObjectID  `bson:"recipientUserId" json:"recipientUserId"`
	Body            string         `bson:"body" json:"body"`
	Distribution    string         `bson:"distribution" json:"distribution"`
	ShareSlug       string         `bson:"shareSlug" json:"shareSlug"`
	HelpRequests    []HelpRequest  `bson:"helpRequests,omitempty" json:"helpRequests"`
	CreatedAt       time.Time      `bson:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time      `bson:"updatedAt" json:"updatedAt"`
}
