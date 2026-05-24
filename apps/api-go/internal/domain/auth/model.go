package auth

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type EmailVerificationToken struct {
	ID             bson.ObjectID `bson:"_id,omitempty"`
	UserID         bson.ObjectID `bson:"userId"`
	Email          string        `bson:"email"`
	CodeHash       string        `bson:"codeHash"`
	ExpiresAt      time.Time     `bson:"expiresAt"`
	FailedAttempts int           `bson:"failedAttempts"`
	LastAttemptAt  *time.Time    `bson:"lastAttemptAt,omitempty"`
	ConsumedAt     *time.Time    `bson:"consumedAt,omitempty"`
	CreatedAt      time.Time     `bson:"createdAt"`
	UpdatedAt      time.Time     `bson:"updatedAt"`
}

type PasswordResetToken struct {
	ID             bson.ObjectID `bson:"_id,omitempty"`
	UserID         bson.ObjectID `bson:"userId"`
	CodeHash       string        `bson:"codeHash"`
	ExpiresAt      time.Time     `bson:"expiresAt"`
	FailedAttempts int           `bson:"failedAttempts"`
	LastAttemptAt  *time.Time    `bson:"lastAttemptAt,omitempty"`
	UsedAt         *time.Time    `bson:"usedAt,omitempty"`
	CreatedAt      time.Time     `bson:"createdAt"`
	UpdatedAt      time.Time     `bson:"updatedAt"`
}

type TrustedDevice struct {
	ID            bson.ObjectID `bson:"_id,omitempty"`
	UserID        bson.ObjectID `bson:"userId"`
	DeviceKeyHash string        `bson:"deviceKeyHash"`
	Label         string        `bson:"label"`
	UserAgent     string        `bson:"userAgent,omitempty"`
	LastIPAddress string        `bson:"lastIpAddress,omitempty"`
	ApprovedAt    time.Time     `bson:"approvedAt"`
	LastSeenAt    time.Time     `bson:"lastSeenAt"`
	RevokedAt     *time.Time    `bson:"revokedAt,omitempty"`
	CreatedAt     time.Time     `bson:"createdAt"`
	UpdatedAt     time.Time     `bson:"updatedAt"`
}

type DeviceVerificationChallenge struct {
	ID             bson.ObjectID `bson:"_id,omitempty"`
	UserID         bson.ObjectID `bson:"userId"`
	Email          string        `bson:"email"`
	DeviceKeyHash  string        `bson:"deviceKeyHash"`
	DeviceLabel    string        `bson:"deviceLabel"`
	UserAgent      string        `bson:"userAgent,omitempty"`
	IPAddress      string        `bson:"ipAddress,omitempty"`
	OTPHash        string        `bson:"otpHash"`
	ExpiresAt      time.Time     `bson:"expiresAt"`
	FailedAttempts int           `bson:"failedAttempts"`
	LastAttemptAt  *time.Time    `bson:"lastAttemptAt,omitempty"`
	ConsumedAt     *time.Time    `bson:"consumedAt,omitempty"`
	CreatedAt      time.Time     `bson:"createdAt"`
	UpdatedAt      time.Time     `bson:"updatedAt"`
}
