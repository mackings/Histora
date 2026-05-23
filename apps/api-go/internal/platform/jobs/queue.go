package jobs

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/redis/go-redis/v9"
)

type CounterSyncJob struct {
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
}

type Queue struct {
	redis *redis.Client
}

func NewQueue(redisClient *redis.Client) *Queue {
	return &Queue{redis: redisClient}
}

func (q *Queue) EnqueueCounterSync(ctx context.Context, job CounterSyncJob) error {
	if q == nil || q.redis == nil {
		return nil
	}
	if job.TargetType == "" || job.TargetID == "" {
		return errors.New("counter sync job target is required")
	}

	payload, err := json.Marshal(job)
	if err != nil {
		return err
	}

	// This is a Go-owned stream for the new worker. During migration, BullMQ can keep
	// running for the Node API until the queue contract is cut over deliberately.
	return q.redis.XAdd(ctx, &redis.XAddArgs{
		Stream: "histora:jobs:counter-sync",
		Values: map[string]any{"payload": string(payload)},
	}).Err()
}
