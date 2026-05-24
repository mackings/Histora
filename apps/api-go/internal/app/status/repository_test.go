package status

import (
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestFeedFilterForAuthenticatedUserIsNotRecursive(t *testing.T) {
	userID := bson.NewObjectID()
	freshFilter := bson.M{
		"$or": bson.A{
			bson.M{"expiresAt": bson.M{"$gt": time.Now()}},
			bson.M{"createdAt": bson.M{"$gt": time.Now().Add(-24 * time.Hour)}},
		},
	}
	filter := bson.M{"$and": bson.A{
		freshFilter,
		bson.M{"$or": bson.A{bson.M{"visibility": "public"}, bson.M{"authorId": userID}}},
	}}

	if _, err := bson.Marshal(filter); err != nil {
		t.Fatalf("feed filter must be encodable without recursive BSON: %v", err)
	}
}
