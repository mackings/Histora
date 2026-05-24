package realtime

import (
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const assemblyAIStreamingURL = "wss://streaming.assemblyai.com/v3/ws"
const transcriptionClientReadLimitBytes = 128 * 1024
const transcriptionUpstreamReadLimitBytes = 256 * 1024
const maxTranscriptionConnectionsPerUser = 1
const maxTranscriptionSessionDuration = 15 * time.Minute

type TranscriptionRelay struct {
	cfg    config.Config
	auth   *auth.Service
	mu     sync.Mutex
	byUser map[string]int
}

func NewTranscriptionRelay(cfg config.Config, authService *auth.Service) *TranscriptionRelay {
	return &TranscriptionRelay{cfg: cfg, auth: authService, byUser: map[string]int{}}
}

func (r *TranscriptionRelay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	if r.auth == nil {
		http.Error(w, "transcription auth unavailable", http.StatusServiceUnavailable)
		return
	}
	if r.cfg.AssemblyAIAPIKey == "" {
		http.Error(w, "AssemblyAI is not configured on the server.", http.StatusServiceUnavailable)
		return
	}
	userID, _, err := r.auth.VerifyWebSocketTicket(strings.TrimSpace(req.URL.Query().Get("ticket")), "transcription")
	if err != nil {
		http.Error(w, "invalid or expired websocket ticket", http.StatusUnauthorized)
		return
	}
	if !r.reserveUserConnection(userID) {
		http.Error(w, "too many active transcription sessions", http.StatusTooManyRequests)
		return
	}
	defer r.releaseUserConnection(userID)
	upgrader := websocket.Upgrader{
		ReadBufferSize:  32 * 1024,
		WriteBufferSize: 32 * 1024,
		CheckOrigin:     r.checkOrigin,
	}
	client, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		return
	}
	defer client.Close()
	client.SetReadLimit(transcriptionClientReadLimitBytes)
	_ = client.SetReadDeadline(time.Now().Add(socketPongWait))
	client.SetPongHandler(func(string) error {
		return client.SetReadDeadline(time.Now().Add(socketPongWait))
	})

	assemblyURL := buildAssemblyURL(req.URL.Query().Get("language"))
	assembly, _, err := websocket.DefaultDialer.Dial(assemblyURL, http.Header{"Authorization": []string{r.cfg.AssemblyAIAPIKey}})
	if err != nil {
		_ = client.WriteJSON(map[string]string{"type": "Error", "error": "The transcription relay connection failed."})
		return
	}
	defer assembly.Close()
	assembly.SetReadLimit(transcriptionUpstreamReadLimitBytes)

	_ = client.WriteJSON(map[string]string{"type": "RelayReady"})

	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = client.Close()
			_ = assembly.Close()
		})
	}

	stopPing := make(chan struct{})
	defer close(stopPing)
	go websocketPingLoop(client, stopPing)

	sessionTimer := time.AfterFunc(maxTranscriptionSessionDuration, closeBoth)
	defer sessionTimer.Stop()

	go proxyWebSocket(assembly, client, closeBoth)
	proxyWebSocket(client, assembly, closeBoth)
}

func (r *TranscriptionRelay) checkOrigin(req *http.Request) bool {
	origin := strings.TrimSpace(req.Header.Get("Origin"))
	if r.cfg.NodeEnv != "production" {
		return true
	}
	if origin == "" {
		return false
	}
	if origin == r.cfg.ClientOrigin {
		return true
	}
	for _, allowed := range r.cfg.ClientOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (r *TranscriptionRelay) reserveUserConnection(userID bson.ObjectID) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := userID.Hex()
	if r.byUser[key] >= maxTranscriptionConnectionsPerUser {
		return false
	}
	r.byUser[key]++
	return true
}

func (r *TranscriptionRelay) releaseUserConnection(userID bson.ObjectID) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := userID.Hex()
	r.byUser[key]--
	if r.byUser[key] <= 0 {
		delete(r.byUser, key)
	}
}

func proxyWebSocket(src *websocket.Conn, dst *websocket.Conn, closeBoth func()) {
	defer closeBoth()
	for {
		messageType, payload, err := src.ReadMessage()
		if err != nil {
			return
		}
		if err := dst.WriteMessage(messageType, payload); err != nil {
			return
		}
	}
}

func websocketPingLoop(conn *websocket.Conn, stop <-chan struct{}) {
	ticker := time.NewTicker(socketPingPeriod)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			_ = conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second))
		case <-stop:
			return
		}
	}
}

func buildAssemblyURL(language string) string {
	streamingConfig := streamingConfigFor(language)
	u, _ := url.Parse(assemblyAIStreamingURL)
	query := u.Query()
	query.Set("sample_rate", "16000")
	query.Set("encoding", "pcm_s16le")
	query.Set("format_turns", "true")
	query.Set("speech_model", streamingConfig.speechModel)
	query.Set("inactivity_timeout", "60")
	if streamingConfig.languageDetection {
		query.Set("language_detection", "true")
	}
	u.RawQuery = query.Encode()
	return u.String()
}

type transcriptionStreamingConfig struct {
	speechModel       string
	languageDetection bool
}

func streamingConfigFor(language string) transcriptionStreamingConfig {
	switch language {
	case "en-US", "en-GB":
		return transcriptionStreamingConfig{speechModel: "universal-streaming-english"}
	case "fr-FR", "es-ES", "de-DE", "pt-BR", "it-IT":
		return transcriptionStreamingConfig{speechModel: "universal-streaming-multilingual", languageDetection: true}
	case "ar-SA":
		return transcriptionStreamingConfig{speechModel: "whisper-rt", languageDetection: true}
	default:
		return transcriptionStreamingConfig{speechModel: "universal-streaming-multilingual", languageDetection: true}
	}
}
