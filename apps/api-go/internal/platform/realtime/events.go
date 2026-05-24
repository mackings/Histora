package realtime

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"net/http"
	"sync"

	"go.mongodb.org/mongo-driver/v2/bson"
)

type Hub struct {
	cfg      config.Config
	auth     *auth.Service
	mu       sync.RWMutex
	channels map[string]map[*websocket.Conn]bool
}

func NewHub(cfg config.Config, a *auth.Service) *Hub {
	return &Hub{cfg: cfg, auth: a, channels: map[string]map[*websocket.Conn]bool{}}
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
	h.mu.RLock()
	conns := h.channels[ch]
	h.mu.RUnlock()
	envelope := map[string]any{"type": "event", "channel": ch, "payload": payload}
	encoded, _ := json.Marshal(envelope)
	for c := range conns {
		_ = c.WriteMessage(websocket.TextMessage, encoded)
	}
}

func canSubscribe(userID bson.ObjectID, channel string) bool {
	channel = strings.TrimSpace(channel)
	if channel == "anonymous:public" {
		return true
	}
	if channel == "user:"+userID.Hex() || channel == "anonymous:inbox:"+userID.Hex() {
		return true
	}
	return strings.HasPrefix(channel, "story:")
}
