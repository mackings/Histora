package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

type CounterSyncJob struct {
	TargetType string `json:"targetType"`
	TargetID   string `json:"targetId"`
	StatusID   string `json:"statusId"`
}

func (q *Queue) RunCounterWorker(ctx context.Context, handler func(context.Context, CounterSyncJob) error) {
	if q == nil || q.redis == nil || handler == nil {
		return
	}
	go func() {
		for ctx.Err() == nil {
			streams, err := q.redis.XRead(ctx, &redis.XReadArgs{
				Streams: []string{"histora:jobs:counter-sync", "$"},
				Count:   1,
				Block:   5 * time.Second,
			}).Result()
			if err != nil {
				if errors.Is(err, redis.Nil) || ctx.Err() != nil {
					continue
				}
				slog.Warn("counter worker read failed", "error", err)
				continue
			}
			for _, stream := range streams {
				for _, message := range stream.Messages {
					raw, _ := message.Values["payload"].(string)
					var job CounterSyncJob
					if err := json.Unmarshal([]byte(raw), &job); err != nil {
						slog.Warn("counter worker invalid payload", "error", err)
						_ = q.redis.XDel(ctx, stream.Stream, message.ID).Err()
						continue
					}
					if job.TargetID == "" {
						job.TargetID = job.StatusID
					}
					if err := handler(ctx, job); err != nil {
						slog.Warn("counter worker job failed", "error", err, "targetType", job.TargetType, "targetId", job.TargetID)
						continue
					}
					_ = q.redis.XDel(ctx, stream.Stream, message.ID).Err()
				}
			}
		}
	}()
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
