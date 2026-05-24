package comment

import (
	"context"
	"time"

	commentdomain "github.com/mackings/histora/apps/api-go/internal/domain/comment"
	"github.com/mackings/histora/apps/api-go/internal/domain/user"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Repository struct {
	comments          *mongo.Collection
	users             *mongo.Collection
	stories           *mongo.Collection
	statuses          *mongo.Collection
	anonymousMessages *mongo.Collection
}

func NewRepository(db *mongo.Database) *Repository {
	return &Repository{
		comments:          db.Collection("comments"),
		users:             db.Collection("users"),
		stories:           db.Collection("stories"),
		statuses:          db.Collection("statuses"),
		anonymousMessages: db.Collection("anonymousmessages"),
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

func (r *Repository) Insert(ctx context.Context, item commentdomain.Comment) (*commentdomain.Comment, error) {
	now := time.Now()
	item.ID = bson.NewObjectID()
	item.CreatedAt = now
	item.UpdatedAt = now
	_, err := r.comments.InsertOne(ctx, item)
	return &item, err
}

func (r *Repository) List(ctx context.Context, targetType string, targetID string) ([]commentdomain.Comment, error) {
	cursor, err := r.comments.Find(
		ctx,
		bson.M{"targetType": targetType, "targetId": targetID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100),
	)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var comments []commentdomain.Comment
	return comments, cursor.All(ctx, &comments)
}

func (r *Repository) StoryChapterExists(ctx context.Context, targetID string) (bool, error) {
	storyID, _ := splitStoryTarget(targetID)
	if storyID.IsZero() {
		return false, nil
	}
	count, err := r.stories.CountDocuments(ctx, bson.M{"_id": storyID})
	return count > 0, err
}

func (r *Repository) IncrementStoryComments(ctx context.Context, targetID string) {
	storyID, _ := splitStoryTarget(targetID)
	if !storyID.IsZero() {
		_, _ = r.stories.UpdateOne(ctx, bson.M{"_id": storyID}, bson.M{"$inc": bson.M{"commentsCount": 1}})
	}
}

func (r *Repository) StatusExists(ctx context.Context, statusID string) (bool, error) {
	id, err := bson.ObjectIDFromHex(statusID)
	if err != nil {
		return false, nil
	}
	count, err := r.statuses.CountDocuments(ctx, bson.M{"_id": id})
	return count > 0, err
}

func (r *Repository) IncrementStatusComments(ctx context.Context, statusID string) {
	if id, err := bson.ObjectIDFromHex(statusID); err == nil {
		_, _ = r.statuses.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"commentsCount": 1}})
	}
}

func (r *Repository) AnonymousMessageExists(ctx context.Context, messageID string) (bool, error) {
	id, err := bson.ObjectIDFromHex(messageID)
	if err != nil {
		return false, nil
	}
	count, err := r.anonymousMessages.CountDocuments(ctx, bson.M{"_id": id})
	return count > 0, err
}

func (r *Repository) IncrementAnonymousComments(ctx context.Context, messageID string) {
	if id, err := bson.ObjectIDFromHex(messageID); err == nil {
		_, _ = r.anonymousMessages.UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$inc": bson.M{"commentsCount": 1}})
	}
}

func splitStoryTarget(targetID string) (bson.ObjectID, string) {
	for index, char := range targetID {
		if char == ':' {
			id, err := bson.ObjectIDFromHex(targetID[:index])
			if err != nil {
				return bson.NilObjectID, ""
			}
			return id, targetID[index+1:]
		}
	}
	return bson.NilObjectID, ""
}
