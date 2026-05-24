package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/redis/go-redis/v9"
	"net/http"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Hub struct {
	cfg        config.Config
	auth       *auth.Service
	command    *redis.Client
	subscriber *redis.Client
	mu         sync.RWMutex
	channels   map[string]map[*websocket.Conn]bool
	delivered  map[string]time.Time
}

const redisEventChannel = "histora:events"

func NewHub(cfg config.Config, a *auth.Service, command *redis.Client, subscribe *redis.Client) *Hub {
	h := &Hub{
		cfg:        cfg,
		auth:       a,
		command:    command,
		subscriber: subscribe,
		channels:   map[string]map[*websocket.Conn]bool{},
		delivered:  map[string]time.Time{},
	}
	h.startRedisSubscription()
	return h
}

func (h *Hub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.auth == nil {
		http.Error(w, "events auth unavailable", http.StatusServiceUnavailable)
		return
	}
	userID, _, err := h.auth.VerifyAccessToken(strings.TrimSpace(r.URL.Query().Get("token")))
	if err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: h.checkOrigin}
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer c.Close()
	defer h.unsubscribeAll(c)
	for {
		var msg map[string]any
		if err := c.ReadJSON(&msg); err != nil {
			return
		}
		if msg["type"] == "subscribe" {
			ch, _ := msg["channel"].(string)
			if !canSubscribe(userID, ch) {
				_ = c.WriteJSON(map[string]any{"type": "error", "error": "channel forbidden"})
				continue
			}
			h.subscribe(ch, c)
			_ = c.WriteJSON(map[string]any{"type": "subscribed", "channel": ch})
		}
	}
}

func (h *Hub) checkOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" || h.cfg.NodeEnv != "production" {
		return true
	}
	if origin == h.cfg.ClientOrigin {
		return true
	}
	for _, allowed := range h.cfg.ClientOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (h *Hub) subscribe(ch string, c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.channels[ch] == nil {
		h.channels[ch] = map[*websocket.Conn]bool{}
	}
	h.channels[ch][c] = true
}

func (h *Hub) unsubscribeAll(c *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for channel, conns := range h.channels {
		delete(conns, c)
		if len(conns) == 0 {
			delete(h.channels, channel)
		}
	}
}

func (h *Hub) Publish(ctx context.Context, ch string, payload any) {
	envelope := map[string]any{"type": "event", "channel": ch, "payload": payload, "eventId": eventID()}
	encoded, _ := json.Marshal(envelope)
	h.deliver(encoded, envelope)
	if h.command != nil {
		_ = h.command.Publish(ctx, redisEventChannel, string(encoded)).Err()
	}
}

func (h *Hub) deliver(encoded []byte, envelope map[string]any) {
	eventIDValue, _ := envelope["eventId"].(string)
	if eventIDValue != "" && h.wasDelivered(eventIDValue) {
		return
	}
	if eventIDValue != "" {
		h.rememberDelivered(eventIDValue)
	}
	ch, _ := envelope["channel"].(string)
	h.mu.RLock()
	conns := h.channels[ch]
	h.mu.RUnlock()
	for c := range conns {
		_ = c.WriteMessage(websocket.TextMessage, encoded)
	}
}

func (h *Hub) startRedisSubscription() {
	if h.subscriber == nil {
		return
	}
	go func() {
		pubsub := h.subscriber.Subscribe(context.Background(), redisEventChannel)
		defer pubsub.Close()
		for message := range pubsub.Channel() {
			var envelope map[string]any
			if err := json.Unmarshal([]byte(message.Payload), &envelope); err != nil {
				slog.Warn("invalid realtime redis payload", "error", err)
				continue
			}
			h.deliver([]byte(message.Payload), envelope)
		}
	}()
}

func (h *Hub) wasDelivered(id string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.delivered[id]
	return ok
}

func (h *Hub) rememberDelivered(id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	h.delivered[id] = now
	for key, timestamp := range h.delivered {
		if now.Sub(timestamp) > time.Minute {
			delete(h.delivered, key)
		}
	}
}

func canSubscribe(userID bson.ObjectID, channel string) bool {
	channel = strings.TrimSpace(channel)
	if channel == "feed" || channel == "anonymous:public" {
		return true
	}
	if channel == "user:"+userID.Hex() || channel == "anonymous:inbox:"+userID.Hex() {
		return true
	}
	return strings.HasPrefix(channel, "story:")
}

func eventID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return time.Now().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(buf)
}
