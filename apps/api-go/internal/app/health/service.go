package health

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/mongo"
)

type Service struct {
	Mongo *mongo.Client
	Redis *redis.Client
}

type Status struct {
	OK     bool              `json:"ok"`
	Checks map[string]string `json:"checks,omitempty"`
}

func (s Service) Check(ctx context.Context) Status {
	checks := map[string]string{"http": "ok"}
	ok := true

	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if s.Mongo != nil {
		if err := s.Mongo.Ping(checkCtx, nil); err != nil {
			checks["mongo"] = "error"
			ok = false
		} else {
			checks["mongo"] = "ok"
		}
	}

	if s.Redis != nil {
		if err := s.Redis.Ping(checkCtx).Err(); err != nil {
			checks["redis"] = "error"
			ok = false
		} else {
			checks["redis"] = "ok"
		}
	}

	return Status{OK: ok, Checks: checks}
}
