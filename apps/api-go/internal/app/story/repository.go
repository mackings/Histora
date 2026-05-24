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

func (r *Repository) FindPublicByID(ctx context.Context, id bson.ObjectID) (*storydomain.Story, error) {
	var story storydomain.Story
	err := r.stories.FindOne(ctx, bson.M{"_id": id, "status": "published"}).Decode(&story)
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

func (r *Repository) ToggleInteraction(ctx context.Context, storyID bson.ObjectID, userID bson.ObjectID, kind string) (bool, int64, int64, error) {
	filter := bson.M{"storyId": storyID, "userId": userID, "kind": kind}
	count, err := r.interactions.CountDocuments(ctx, filter)
	if err != nil {
		return false, 0, 0, err
	}
	active := false
	if count > 0 {
		_, err = r.interactions.DeleteOne(ctx, filter)
	} else {
		_, err = r.interactions.InsertOne(ctx, bson.M{
			"storyId":   storyID,
			"userId":    userID,
			"kind":      kind,
			"createdAt": time.Now(),
			"updatedAt": time.Now(),
		})
		active = true
	}
	if err != nil {
		return false, 0, 0, err
	}
	likes, err := r.interactions.CountDocuments(ctx, bson.M{"storyId": storyID, "kind": "like"})
	if err != nil {
		return false, 0, 0, err
	}
	bookmarks, err := r.interactions.CountDocuments(ctx, bson.M{"storyId": storyID, "kind": "bookmark"})
	if err != nil {
		return false, 0, 0, err
	}
	_, err = r.stories.UpdateOne(ctx, bson.M{"_id": storyID}, bson.M{"$set": bson.M{
		"likesCount":     likes,
		"bookmarksCount": bookmarks,
		"reactionsCount": likes + bookmarks,
		"updatedAt":      time.Now(),
	}})
	return active, likes, bookmarks, err
}

func (r *Repository) IncrementShares(ctx context.Context, storyID bson.ObjectID) (int64, error) {
	_, err := r.stories.UpdateOne(ctx, bson.M{"_id": storyID}, bson.M{"$inc": bson.M{"sharesCount": 1}, "$set": bson.M{"updatedAt": time.Now()}})
	if err != nil {
		return 0, err
	}
	var story storydomain.Story
	if err := r.stories.FindOne(ctx, bson.M{"_id": storyID}).Decode(&story); err != nil {
		return 0, err
	}
	return story.SharesCount, nil
}

func (r *Repository) IncrementReadCount(ctx context.Context, storyID bson.ObjectID) {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	_, _ = r.stories.UpdateOne(ctx, bson.M{"_id": storyID}, bson.M{"$inc": bson.M{"readCount": 1}})
}
