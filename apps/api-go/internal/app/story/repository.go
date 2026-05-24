package story

import (
	"context"
	"time"

	storydomain "github.com/mackings/histora/apps/api-go/internal/domain/story"
	"github.com/mackings/histora/apps/api-go/internal/domain/user"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Repository struct {
	stories      *mongo.Collection
	interactions *mongo.Collection
	users        *mongo.Collection
}

func NewRepository(db *mongo.Database) *Repository {
	return &Repository{
		stories:      db.Collection("stories"),
		interactions: db.Collection("storyinteractions"),
		users:        db.Collection("users"),
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

func (r *Repository) FindFeed(ctx context.Context, limit int) ([]storydomain.Story, error) {
	opts := options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}}).SetLimit(int64(limit))
	cursor, err := r.stories.Find(ctx, bson.M{"status": "published", "visibility": "public"}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var stories []storydomain.Story
	if err := cursor.All(ctx, &stories); err != nil {
		return nil, err
	}
	return stories, nil
}

func (r *Repository) FindMine(ctx context.Context, userID bson.ObjectID) ([]storydomain.Story, error) {
	opts := options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}})
	cursor, err := r.stories.Find(ctx, bson.M{"authorId": userID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var stories []storydomain.Story
	return stories, cursor.All(ctx, &stories)
}

func (r *Repository) FindCollaborative(ctx context.Context, userID bson.ObjectID) ([]storydomain.Story, error) {
	opts := options.Find().SetSort(bson.D{{Key: "updatedAt", Value: -1}})
	cursor, err := r.stories.Find(ctx, bson.M{"authorId": bson.M{"$ne": userID}, "collaborators.userId": userID}, opts)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var stories []storydomain.Story
	return stories, cursor.All(ctx, &stories)
}

func (r *Repository) FindEditableByID(ctx context.Context, storyID, userID bson.ObjectID) (*storydomain.Story, error) {
	var story storydomain.Story
	err := r.stories.FindOne(ctx, bson.M{
		"_id": storyID,
		"$or": bson.A{
			bson.M{"authorId": userID},
			bson.M{"collaborators.userId": userID},
		},
	}).Decode(&story)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &story, err
}

func (r *Repository) FindPublicBySlug(ctx context.Context, slug string) (*storydomain.Story, error) {
	var story storydomain.Story
	err := r.stories.FindOne(ctx, bson.M{"slug": slug, "status": "published"}).Decode(&story)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &story, err
}

func (r *Repository) FindSlug(ctx context.Context, slug string) (*storydomain.Story, error) {
	var story storydomain.Story
	err := r.stories.FindOne(ctx, bson.M{"slug": slug}).Decode(&story)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return &story, err
}

func (r *Repository) Insert(ctx context.Context, story storydomain.Story) (*storydomain.Story, error) {
	now := time.Now()
	story.ID = bson.NewObjectID()
	story.CreatedAt = now
	story.UpdatedAt = now
	_, err := r.stories.InsertOne(ctx, story)
	return &story, err
}

func (r *Repository) Replace(ctx context.Context, story storydomain.Story) (*storydomain.Story, error) {
	story.UpdatedAt = time.Now()
	_, err := r.stories.ReplaceOne(ctx, bson.M{"_id": story.ID}, story)
	return &story, err
}

func (r *Repository) IncrementReadCount(ctx context.Context, storyID bson.ObjectID) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, _ = r.stories.UpdateOne(ctx, bson.M{"_id": storyID}, bson.M{"$inc": bson.M{"readCount": 1}})
}
