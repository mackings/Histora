package status

import (
	"context"
	"time"

	statusdomain "github.com/mackings/histora/apps/api-go/internal/domain/status"
	"github.com/mackings/histora/apps/api-go/internal/domain/user"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Repository struct {
	statuses     *mongo.Collection
	interactions *mongo.Collection
	users        *mongo.Collection
	comments     *mongo.Collection
}

func NewRepository(db *mongo.Database) *Repository {
	return &Repository{
		statuses:     db.Collection("statuses"),
		interactions: db.Collection("statusinteractions"),
		users:        db.Collection("users"),
		comments:     db.Collection("comments"),
	}
}

func (r *Repository) FindUserByID(ctx context.Context, id bson.ObjectID) (*user.User, error) {
	var out user.User
	err := r.users.FindOne(ctx, bson.M{"_id": id}).Decode(&out)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &out, err
}

func (r *Repository) Insert(ctx context.Context, status statusdomain.Status) (*statusdomain.Status, error) {
	now := time.Now()
	status.ID = bson.NewObjectID()
	status.CreatedAt = now
	status.UpdatedAt = now
	_, err := r.statuses.InsertOne(ctx, status)
	return &status, err
}

func (r *Repository) Feed(ctx context.Context, userID *bson.ObjectID) ([]statusdomain.Status, error) {
	freshFilter := bson.M{
		"$or": bson.A{
			bson.M{"expiresAt": bson.M{"$gt": time.Now()}},
			bson.M{"createdAt": bson.M{"$gt": time.Now().Add(-24 * time.Hour)}},
		},
	}
	filter := freshFilter
	if userID == nil {
		filter["visibility"] = "public"
	} else {
		filter = bson.M{"$and": bson.A{
			freshFilter,
			bson.M{"$or": bson.A{bson.M{"visibility": "public"}, bson.M{"authorId": *userID}}},
		}}
	}
	cursor, err := r.statuses.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(40))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var statuses []statusdomain.Status
	return statuses, cursor.All(ctx, &statuses)
}

func (r *Repository) Mine(ctx context.Context, userID bson.ObjectID) ([]statusdomain.Status, error) {
	cursor, err := r.statuses.Find(ctx, bson.M{"authorId": userID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(50))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var statuses []statusdomain.Status
	return statuses, cursor.All(ctx, &statuses)
}

func (r *Repository) ByShareSlug(ctx context.Context, slug string) (*statusdomain.Status, error) {
	var status statusdomain.Status
	err := r.statuses.FindOne(ctx, bson.M{"shareSlug": slug, "anonymous": true}).Decode(&status)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &status, err
}

func (r *Repository) FindByID(ctx context.Context, id bson.ObjectID) (*statusdomain.Status, error) {
	var status statusdomain.Status
	err := r.statuses.FindOne(ctx, bson.M{"_id": id}).Decode(&status)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &status, err
}

func (r *Repository) DeleteOwned(ctx context.Context, statusID bson.ObjectID, userID bson.ObjectID) error {
	_, err := r.statuses.DeleteOne(ctx, bson.M{"_id": statusID, "authorId": userID})
	if err != nil {
		return err
	}
	_, _ = r.interactions.DeleteMany(ctx, bson.M{"statusId": statusID})
	_, _ = r.comments.DeleteMany(ctx, bson.M{"targetType": "status", "targetId": statusID.Hex()})
	return nil
}

func (r *Repository) ToggleInteraction(ctx context.Context, statusID bson.ObjectID, userID bson.ObjectID, kind string) (bool, int64, int64, error) {
	filter := bson.M{"statusId": statusID, "userId": userID, "kind": kind}
	count, err := r.interactions.CountDocuments(ctx, filter)
	if err != nil {
		return false, 0, 0, err
	}
	active := false
	if count > 0 {
		_, err = r.interactions.DeleteOne(ctx, filter)
	} else {
		_, err = r.interactions.InsertOne(ctx, bson.M{"statusId": statusID, "userId": userID, "kind": kind, "createdAt": time.Now(), "updatedAt": time.Now()})
		active = true
	}
	if err != nil {
		return false, 0, 0, err
	}
	likes, err := r.interactions.CountDocuments(ctx, bson.M{"statusId": statusID, "kind": "like"})
	if err != nil {
		return false, 0, 0, err
	}
	bookmarks, err := r.interactions.CountDocuments(ctx, bson.M{"statusId": statusID, "kind": "bookmark"})
	if err != nil {
		return false, 0, 0, err
	}
	_, err = r.statuses.UpdateOne(ctx, bson.M{"_id": statusID}, bson.M{"$set": bson.M{"likesCount": likes, "bookmarksCount": bookmarks, "updatedAt": time.Now()}})
	return active, likes, bookmarks, err
}
