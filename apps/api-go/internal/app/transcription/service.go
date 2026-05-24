package transcription

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/mackings/histora/apps/api-go/internal/config"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type Service struct {
	cfg  config.Config
	http *http.Client
}

func NewService(cfg config.Config) *Service {
	return &Service{cfg: cfg, http: &http.Client{Timeout: 45 * time.Second}}
}
func (s *Service) Token(ctx context.Context) (map[string]any, error) {
	if s.cfg.AssemblyAIAPIKey == "" {
		return nil, apperror.New(500, "AssemblyAI transcription is not configured on the server.")
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://streaming.assemblyai.com/v3/token?expires_in_seconds=300&max_session_duration_seconds=1800", nil)
	req.Header.Set("Authorization", s.cfg.AssemblyAIAPIKey)
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	if res.StatusCode >= 400 {
		return nil, apperror.New(res.StatusCode, "AssemblyAI token request failed")
	}
	return out, nil
}
func (s *Service) Transcribe(ctx context.Context, body []byte, mimeType string, language string) (map[string]any, error) {
	if s.cfg.OpenAIAPIKey == "" {
		return nil, apperror.New(500, "OpenAI transcription is not configured on the server.")
	}
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	part, _ := writer.CreateFormFile("file", "studio-transcription.webm")
	_, _ = part.Write(body)
	_ = writer.WriteField("model", "gpt-4o-mini-transcribe")
	if language != "" {
		_ = writer.WriteField("language", language)
	}
	_ = writer.Close()
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/audio/transcriptions", &buffer)
	req.Header.Set("Authorization", "Bearer "+s.cfg.OpenAIAPIKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := s.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(res.Body)
	if res.StatusCode >= 400 {
		return nil, apperror.New(res.StatusCode, "Transcription failed: "+string(payload))
	}
	var out map[string]any
	_ = json.Unmarshal(payload, &out)
	if _, ok := out["text"]; !ok {
		out["text"] = ""
	}
	return out, nil
}
