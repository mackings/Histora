package realtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
)

type Hub struct {
	cfg        config.Config
	auth       *auth.Service
	command    *redis.Client
	subscriber *redis.Client
	db         *mongo.Database
	mu         sync.RWMutex
	channels   map[string]map[*socketClient]bool
	byUser     map[string]map[*socketClient]bool
	pending    map[string]int
	delivered  map[string]time.Time
}

const redisEventChannel = "histora:events"
const maxDraftSnapshotBytes = 60_000
const eventsReadLimitBytes = 72 * 1024
const eventsMaxSubscriptions = 64
const maxEventConnectionsPerUser = 8
const socketPongWait = 70 * time.Second
const socketPingPeriod = 30 * time.Second

type socketClient struct {
	conn          *websocket.Conn
	userID        bson.ObjectID
	sessionID     string
	writeMu       sync.Mutex
	subscriptions map[string]bool
	lastDraftAt   time.Time
}

func NewHub(cfg config.Config, a *auth.Service, command *redis.Client, subscribe *redis.Client, db *mongo.Database) *Hub {
	h := &Hub{
		cfg:        cfg,
		auth:       a,
		command:    command,
		subscriber: subscribe,
		db:         db,
		channels:   map[string]map[*socketClient]bool{},
		byUser:     map[string]map[*socketClient]bool{},
		pending:    map[string]int{},
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
	userID, sessionID, err := h.auth.VerifyWebSocketTicket(strings.TrimSpace(r.URL.Query().Get("ticket")), "events")
	if err != nil {
		http.Error(w, "invalid or expired websocket ticket", http.StatusUnauthorized)
		return
	}
	if !h.reserveUserConnection(userID) {
		http.Error(w, "too many active realtime connections", http.StatusTooManyRequests)
		return
	}
	upgrader := websocket.Upgrader{CheckOrigin: h.checkOrigin}
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.releaseReservedUserConnection(userID)
		return
	}
	defer c.Close()
	client := &socketClient{conn: c, userID: userID, sessionID: sessionID, subscriptions: map[string]bool{}}
	h.attachReservedUserConnection(client)
	defer h.unregister(client)
	c.SetReadLimit(eventsReadLimitBytes)
	_ = c.SetReadDeadline(time.Now().Add(socketPongWait))
	c.SetPongHandler(func(string) error {
		return c.SetReadDeadline(time.Now().Add(socketPongWait))
	})
	stopPing := make(chan struct{})
	defer close(stopPing)
	go client.pingLoop(stopPing)
	for {
		var msg map[string]any
		if err := c.ReadJSON(&msg); err != nil {
			return
		}
		if msg["type"] == "subscribe" {
			ch, _ := msg["channel"].(string)
			if err := h.subscribe(r.Context(), client, ch); err != nil {
				_ = client.writeJSON(map[string]any{"type": "error", "error": err.Error()})
				continue
			}
			_ = client.writeJSON(map[string]any{"type": "subscribed", "channel": strings.TrimSpace(ch)})
			continue
		}
		if msg["type"] == "story-draft-update" {
			if !client.allowDraftUpdate() {
				_ = client.writeJSON(map[string]any{"type": "error", "error": "Too many draft updates."})
				continue
			}
			if err := h.handleStoryDraftUpdate(r.Context(), userID, client, msg); err != nil {
				_ = client.writeJSON(map[string]any{"type": "error", "error": err.Error()})
			}
			continue
		}
		_ = client.writeJSON(map[string]any{"type": "error", "error": "Invalid realtime payload."})
	}
}

func (h *Hub) handleStoryDraftUpdate(ctx context.Context, userID bson.ObjectID, c *socketClient, msg map[string]any) error {
	if h.db == nil {
		return errRealtime("realtime story lookup unavailable")
	}
	storyIDText, _ := msg["storyId"].(string)
	storyID, err := bson.ObjectIDFromHex(strings.TrimSpace(storyIDText))
	if err != nil {
		return errRealtime("Invalid story id.")
	}
	snapshot, ok := msg["snapshot"].(map[string]any)
	if !ok {
		return errRealtime("Invalid draft snapshot.")
	}
	encodedSnapshot, err := json.Marshal(snapshot)
	if err != nil {
		return errRealtime("Invalid draft snapshot.")
	}
	if len(encodedSnapshot) > maxDraftSnapshotBytes {
		return errRealtime("Draft update is too large.")
	}

	var story struct {
		ID            bson.ObjectID `bson:"_id"`
		AuthorID      bson.ObjectID `bson:"authorId"`
		Collaborators []struct {
			UserID bson.ObjectID `bson:"userId"`
		} `bson:"collaborators"`
	}
	err = h.db.Collection("stories").FindOne(
		ctx,
		bson.M{"_id": storyID},
		options.FindOne().SetProjection(bson.M{"authorId": 1, "collaborators.userId": 1}),
	).Decode(&story)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			return errRealtime("Story not found.")
		}
		return errRealtime("Unable to load story.")
	}

	participants := map[bson.ObjectID]bool{story.AuthorID: true}
	allowed := story.AuthorID == userID
	for _, collaborator := range story.Collaborators {
		if !collaborator.UserID.IsZero() {
			participants[collaborator.UserID] = true
		}
		if collaborator.UserID == userID {
			allowed = true
		}
	}
	if !allowed {
		return errRealtime("Forbidden collaboration update.")
	}

	var actor struct {
		FullName string `bson:"fullName"`
		Username string `bson:"username"`
	}
	_ = h.db.Collection("users").FindOne(
		ctx,
		bson.M{"_id": userID},
		options.FindOne().SetProjection(bson.M{"fullName": 1, "username": 1}),
	).Decode(&actor)
	if strings.TrimSpace(actor.FullName) == "" {
		actor.FullName = "Collaborator"
	}
	if strings.TrimSpace(actor.Username) == "" {
		actor.Username = "collaborator"
	}

	reason, _ := msg["reason"].(string)
	if strings.TrimSpace(reason) == "" {
		reason = "draft-update"
	}
	draftSessionID, _ := msg["draftSessionId"].(string)
	payload := map[string]any{
		"kind":              "story.collaboration.draft.updated",
		"storyId":           story.ID.Hex(),
		"draftSessionId":    draftSessionID,
		"reason":            reason,
		"updatedAt":         time.Now().UTC().Format(time.RFC3339Nano),
		"updatedByName":     actor.FullName,
		"updatedByUsername": actor.Username,
		"snapshot":          snapshot,
	}

	for participantID := range participants {
		h.Publish(ctx, "user:"+participantID.Hex(), payload)
	}
	_ = c.writeJSON(map[string]any{"type": "ack", "storyId": story.ID.Hex(), "reason": reason})
	return nil
}

type realtimeError string

func (e realtimeError) Error() string {
	return string(e)
}

func errRealtime(message string) error {
	return realtimeError(message)
}

func (h *Hub) checkOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if h.cfg.NodeEnv != "production" {
		return true
	}
	if origin == "" {
		return false
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

func (h *Hub) subscribe(ctx context.Context, c *socketClient, ch string) error {
	ch = strings.TrimSpace(ch)
	if ch == "" {
		return errRealtime("Invalid channel.")
	}
	if len(c.subscriptions) >= eventsMaxSubscriptions && !c.subscriptions[ch] {
		return errRealtime("Too many subscriptions.")
	}
	allowed, err := h.canSubscribe(ctx, c.userID, ch)
	if err != nil {
		return errRealtime("Unable to authorize channel.")
	}
	if !allowed {
		return errRealtime("Channel forbidden.")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.channels[ch] == nil {
		h.channels[ch] = map[*socketClient]bool{}
	}
	h.channels[ch][c] = true
	c.subscriptions[ch] = true
	return nil
}

func (h *Hub) unregister(c *socketClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for channel, conns := range h.channels {
		delete(conns, c)
		if len(conns) == 0 {
			delete(h.channels, channel)
		}
	}
	delete(h.byUser[c.userID.Hex()], c)
	if len(h.byUser[c.userID.Hex()]) == 0 {
		delete(h.byUser, c.userID.Hex())
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
		_ = c.writeMessage(websocket.TextMessage, encoded)
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

func (h *Hub) canSubscribe(ctx context.Context, userID bson.ObjectID, channel string) (bool, error) {
	channel = strings.TrimSpace(channel)
	if channel == "feed" || channel == "anonymous:public" {
		return true, nil
	}
	if channel == "user:"+userID.Hex() || channel == "anonymous:inbox:"+userID.Hex() {
		return true, nil
	}
	if strings.HasPrefix(channel, "story:") {
		return h.canAccessStoryChannel(ctx, userID, strings.TrimPrefix(channel, "story:"))
	}
	return false, nil
}

func (h *Hub) canAccessStoryChannel(ctx context.Context, userID bson.ObjectID, storyIDText string) (bool, error) {
	if h.db == nil {
		return false, nil
	}
	storyID, err := bson.ObjectIDFromHex(strings.TrimSpace(storyIDText))
	if err != nil {
		return false, nil
	}
	var story struct {
		Status           string          `bson:"status"`
		Visibility       string          `bson:"visibility"`
		AuthorID         bson.ObjectID   `bson:"authorId"`
		AllowedViewerIDs []bson.ObjectID `bson:"allowedViewerIds"`
		Collaborators    []struct {
			UserID bson.ObjectID `bson:"userId"`
		} `bson:"collaborators"`
	}
	err = h.db.Collection("stories").FindOne(
		ctx,
		bson.M{"_id": storyID},
		options.FindOne().SetProjection(bson.M{"status": 1, "visibility": 1, "authorId": 1, "allowedViewerIds": 1, "collaborators.userId": 1}),
	).Decode(&story)
	if err == mongo.ErrNoDocuments {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if story.AuthorID == userID {
		return true, nil
	}
	for _, collaborator := range story.Collaborators {
		if collaborator.UserID == userID {
			return true, nil
		}
	}
	if story.Status != "published" {
		return false, nil
	}
	if story.Visibility == "public" {
		return true, nil
	}
	for _, viewerID := range story.AllowedViewerIDs {
		if viewerID == userID {
			return true, nil
		}
	}
	return false, nil
}

func (h *Hub) reserveUserConnection(userID bson.ObjectID) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := userID.Hex()
	if len(h.byUser[key])+h.pending[key] >= maxEventConnectionsPerUser {
		return false
	}
	if h.byUser[key] == nil {
		h.byUser[key] = map[*socketClient]bool{}
	}
	h.pending[key]++
	return true
}

func (h *Hub) attachReservedUserConnection(c *socketClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := c.userID.Hex()
	if h.pending[key] > 0 {
		h.pending[key]--
	}
	if h.pending[key] == 0 {
		delete(h.pending, key)
	}
	h.byUser[key][c] = true
}

func (h *Hub) releaseReservedUserConnection(userID bson.ObjectID) {
	h.mu.Lock()
	defer h.mu.Unlock()
	key := userID.Hex()
	if h.pending[key] > 0 {
		h.pending[key]--
	}
	if h.pending[key] == 0 {
		delete(h.pending, key)
	}
	if len(h.byUser[key]) == 0 {
		delete(h.byUser, key)
	}
}

func (c *socketClient) writeJSON(payload any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteJSON(payload)
}

func (c *socketClient) writeMessage(messageType int, payload []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteMessage(messageType, payload)
}

func (c *socketClient) pingLoop(stop <-chan struct{}) {
	ticker := time.NewTicker(socketPingPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			_ = c.writeMessage(websocket.PingMessage, nil)
		case <-stop:
			return
		}
	}
}

func (c *socketClient) allowDraftUpdate() bool {
	now := time.Now()
	if !c.lastDraftAt.IsZero() && now.Sub(c.lastDraftAt) < 150*time.Millisecond {
		return false
	}
	c.lastDraftAt = now
	return true
}

func eventID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return time.Now().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(buf)
}
