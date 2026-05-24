package jobs

import (
	"context"
	"strings"
	"time"

	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type CounterReconciler struct {
	db *mongo.Database
}

func NewCounterReconciler(db *mongo.Database) *CounterReconciler {
	return &CounterReconciler{db: db}
}

func (r *CounterReconciler) Reconcile(ctx context.Context, job CounterSyncJob) error {
	if r == nil || r.db == nil {
		return nil
	}
	targetType := strings.TrimSpace(job.TargetType)
	targetID := strings.TrimSpace(job.TargetID)
	if targetID == "" {
		targetID = strings.TrimSpace(job.StatusID)
	}
	switch targetType {
	case "status":
		return r.reconcileStatus(ctx, targetID)
	case "story":
		return r.reconcileStory(ctx, targetID)
	case "anonymousMessage":
		return r.reconcileAnonymousMessage(ctx, targetID)
	default:
		return apperror.BadRequest("Unsupported counter sync target.")
	}
}

func (r *CounterReconciler) reconcileStatus(ctx context.Context, targetID string) error {
	id, err := bson.ObjectIDFromHex(targetID)
	if err != nil {
		return apperror.BadRequest("Invalid status id.")
	}
	likes, err := r.db.Collection("statusinteractions").CountDocuments(ctx, bson.M{"statusId": id, "kind": "like"})
	if err != nil {
		return err
	}
	bookmarks, err := r.db.Collection("statusinteractions").CountDocuments(ctx, bson.M{"statusId": id, "kind": "bookmark"})
	if err != nil {
		return err
	}
	comments, err := r.db.Collection("comments").CountDocuments(ctx, bson.M{"targetType": "status", "targetId": targetID})
	if err != nil {
		return err
	}
	_, err = r.db.Collection("statuses").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"likesCount": likes, "bookmarksCount": bookmarks, "commentsCount": comments, "updatedAt": time.Now()}})
	return err
}

func (r *CounterReconciler) reconcileStory(ctx context.Context, targetID string) error {
	id, err := bson.ObjectIDFromHex(targetID)
	if err != nil {
		return apperror.BadRequest("Invalid story id.")
	}
	likes, err := r.db.Collection("storyinteractions").CountDocuments(ctx, bson.M{"storyId": id, "kind": "like"})
	if err != nil {
		return err
	}
	bookmarks, err := r.db.Collection("storyinteractions").CountDocuments(ctx, bson.M{"storyId": id, "kind": "bookmark"})
	if err != nil {
		return err
	}
	comments, err := r.db.Collection("comments").CountDocuments(ctx, bson.M{"targetType": "storyChapter", "targetId": bson.M{"$regex": "^" + targetID + ":"}})
	if err != nil {
		return err
	}
	_, err = r.db.Collection("stories").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"likesCount": likes, "bookmarksCount": bookmarks, "reactionsCount": likes + bookmarks, "commentsCount": comments, "updatedAt": time.Now()}})
	return err
}

func (r *CounterReconciler) reconcileAnonymousMessage(ctx context.Context, targetID string) error {
	id, err := bson.ObjectIDFromHex(targetID)
	if err != nil {
		return apperror.BadRequest("Invalid anonymous message id.")
	}
	comments, err := r.db.Collection("comments").CountDocuments(ctx, bson.M{"targetType": "anonymousMessage", "targetId": targetID})
	if err != nil {
		return err
	}
	_, err = r.db.Collection("anonymousmessages").UpdateOne(ctx, bson.M{"_id": id}, bson.M{"$set": bson.M{"commentsCount": comments, "updatedAt": time.Now()}})
	return err
}
