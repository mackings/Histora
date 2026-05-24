package session

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Session struct {
	ID              bson.ObjectID  `bson:"_id,omitempty"`
	UserID          bson.ObjectID  `bson:"userId"`
	TokenHash       string         `bson:"tokenHash"`
	Family          string         `bson:"family"`
	ParentSessionID *bson.ObjectID `bson:"parentSessionId,omitempty"`
	DeviceKeyHash   string         `bson:"deviceKeyHash,omitempty"`
	DeviceLabel     string         `bson:"deviceLabel,omitempty"`
	UserAgent       string         `bson:"userAgent,omitempty"`
	IPAddress       string         `bson:"ipAddress,omitempty"`
	ExpiresAt       time.Time      `bson:"expiresAt"`
	LastSeenAt      time.Time      `bson:"lastSeenAt"`
	RevokedAt       *time.Time     `bson:"revokedAt,omitempty"`
	CreatedAt       time.Time      `bson:"createdAt"`
	UpdatedAt       time.Time      `bson:"updatedAt"`
}
