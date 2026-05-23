package mongo

import (
	"context"
	"net/url"
	"strings"
	"time"

	"github.com/mackings/histora/apps/api-go/internal/config"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Store struct {
	Client *mongo.Client
	DB     *mongo.Database
}

func Connect(ctx context.Context, cfg config.Config) (*Store, error) {
	client, err := mongo.Connect(options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, err
	}

	return &Store{
		Client: client,
		DB:     client.Database(databaseNameFromURI(cfg.MongoURI)),
	}, nil
}

func (s *Store) Disconnect(ctx context.Context) error {
	if s == nil || s.Client == nil {
		return nil
	}
	return s.Client.Disconnect(ctx)
}

func databaseNameFromURI(uri string) string {
	parsed, err := url.Parse(uri)
	if err == nil {
		dbName := strings.Trim(parsed.Path, "/")
		if dbName != "" {
			return dbName
		}
	}
	return "histora"
}
