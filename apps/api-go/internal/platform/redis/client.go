package redis

import (
	"context"
	"time"

	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/redis/go-redis/v9"
)

type Clients struct {
	Command   *redis.Client
	Subscribe *redis.Client
}

func Connect(ctx context.Context, cfg config.Config) (*Clients, error) {
	if cfg.RedisURL == "" {
		return &Clients{}, nil
	}

	opts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		return nil, err
	}

	command := redis.NewClient(opts)
	subscribe := redis.NewClient(opts)

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := command.Ping(pingCtx).Err(); err != nil {
		_ = command.Close()
		_ = subscribe.Close()
		return nil, err
	}

	return &Clients{Command: command, Subscribe: subscribe}, nil
}

func (c *Clients) Close() error {
	if c == nil {
		return nil
	}
	if c.Command != nil {
		_ = c.Command.Close()
	}
	if c.Subscribe != nil {
		_ = c.Subscribe.Close()
	}
	return nil
}
