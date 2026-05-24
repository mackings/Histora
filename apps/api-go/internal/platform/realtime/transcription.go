package realtime

import (
	"net/http"
	"net/url"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/mackings/histora/apps/api-go/internal/app/auth"
	"github.com/mackings/histora/apps/api-go/internal/config"
)

const assemblyAIStreamingURL = "wss://streaming.assemblyai.com/v3/ws"

type TranscriptionRelay struct {
	cfg  config.Config
	auth *auth.Service
}

func NewTranscriptionRelay(cfg config.Config, authService *auth.Service) *TranscriptionRelay {
	return &TranscriptionRelay{cfg: cfg, auth: authService}
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
	if _, _, err := r.auth.VerifyAccessToken(strings.TrimSpace(req.URL.Query().Get("token"))); err != nil {
		http.Error(w, "invalid or expired access token", http.StatusUnauthorized)
		return
	}
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

	assemblyURL := buildAssemblyURL(req.URL.Query().Get("language"))
	assembly, _, err := websocket.DefaultDialer.Dial(assemblyURL, http.Header{"Authorization": []string{r.cfg.AssemblyAIAPIKey}})
	if err != nil {
		_ = client.WriteJSON(map[string]string{"type": "Error", "error": "The transcription relay connection failed."})
		return
	}
	defer assembly.Close()

	_ = client.WriteJSON(map[string]string{"type": "RelayReady"})

	var once sync.Once
	closeBoth := func() {
		once.Do(func() {
			_ = client.Close()
			_ = assembly.Close()
		})
	}

	go proxyWebSocket(assembly, client, closeBoth)
	proxyWebSocket(client, assembly, closeBoth)
}

func (r *TranscriptionRelay) checkOrigin(req *http.Request) bool {
	origin := strings.TrimSpace(req.Header.Get("Origin"))
	if origin == "" || r.cfg.NodeEnv != "production" {
		return true
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
