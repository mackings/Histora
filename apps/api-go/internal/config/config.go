package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                  int
	MongoURI              string
	RedisURL              string
	JWTSecret             string
	JWTRefreshSecret      string
	AccessTokenTTL        time.Duration
	RefreshTokenTTLDays   int
	RefreshCookieName     string
	AppBaseURL            string
	ClientOrigin          string
	ClientOrigins         []string
	AllowVercelPreviews   bool
	NodeEnv               string
	DataEncryptionKey     string
	R2AccountID           string
	R2AccessKeyID         string
	R2SecretAccessKey     string
	R2BucketName          string
	R2PublicBaseURL       string
	SMTPHost              string
	SMTPPort              int
	SMTPUser              string
	SMTPPassword          string
	SMTPFromName          string
	MailjetAPIKey         string
	MailjetAPISecret      string
	MailjetFromEmail      string
	MailjetFromName       string
	VAPIDPublicKey        string
	VAPIDPrivateKey       string
	VAPIDSubject          string
	OpenAIAPIKey          string
	AssemblyAIAPIKey      string
	TranscriptionProvider string
	ClamAVHost            string
	ClamAVPort            int
	ClamAVTimeout         time.Duration
	TurnstileSecretKey    string
}

func Load() (Config, error) {
	cfg := Config{
		Port:                  intEnv("PORT", 4000),
		MongoURI:              strings.TrimSpace(os.Getenv("MONGODB_URI")),
		RedisURL:              strings.TrimSpace(os.Getenv("REDIS_URL")),
		JWTSecret:             strings.TrimSpace(os.Getenv("JWT_SECRET")),
		JWTRefreshSecret:      strings.TrimSpace(os.Getenv("JWT_REFRESH_SECRET")),
		AccessTokenTTL:        durationEnv("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTokenTTLDays:   intEnv("REFRESH_TOKEN_TTL_DAYS", 30),
		RefreshCookieName:     stringEnv("REFRESH_COOKIE_NAME", "histora_refresh"),
		AppBaseURL:            strings.TrimSpace(os.Getenv("APP_BASE_URL")),
		ClientOrigin:          strings.TrimSpace(os.Getenv("CLIENT_ORIGIN")),
		ClientOrigins:         splitCSV(os.Getenv("CLIENT_ORIGINS")),
		AllowVercelPreviews:   os.Getenv("ALLOW_VERCEL_PREVIEWS") == "true",
		NodeEnv:               stringEnv("NODE_ENV", "development"),
		DataEncryptionKey:     strings.TrimSpace(os.Getenv("DATA_ENCRYPTION_KEY")),
		R2AccountID:           strings.TrimSpace(os.Getenv("R2_ACCOUNT_ID")),
		R2AccessKeyID:         strings.TrimSpace(os.Getenv("R2_ACCESS_KEY_ID")),
		R2SecretAccessKey:     strings.TrimSpace(os.Getenv("R2_SECRET_ACCESS_KEY")),
		R2BucketName:          strings.TrimSpace(os.Getenv("R2_BUCKET_NAME")),
		R2PublicBaseURL:       strings.TrimSpace(os.Getenv("R2_PUBLIC_BASE_URL")),
		SMTPHost:              stringEnv("SMTP_HOST", "smtp.gmail.com"),
		SMTPPort:              intEnv("SMTP_PORT", 465),
		SMTPUser:              strings.TrimSpace(os.Getenv("SMTP_USER")),
		SMTPPassword:          strings.TrimSpace(os.Getenv("SMTP_PASSWORD")),
		SMTPFromName:          stringEnv("SMTP_FROM_NAME", "Histora"),
		MailjetAPIKey:         strings.TrimSpace(os.Getenv("MAILJET_API_KEY")),
		MailjetAPISecret:      strings.TrimSpace(os.Getenv("MAILJET_API_SECRET")),
		MailjetFromEmail:      strings.TrimSpace(os.Getenv("MAILJET_FROM_EMAIL")),
		MailjetFromName:       stringEnv("MAILJET_FROM_NAME", "Histora"),
		VAPIDPublicKey:        strings.TrimSpace(os.Getenv("VAPID_PUBLIC_KEY")),
		VAPIDPrivateKey:       strings.TrimSpace(os.Getenv("VAPID_PRIVATE_KEY")),
		VAPIDSubject:          stringEnv("VAPID_SUBJECT", "mailto:security@histora.app"),
		OpenAIAPIKey:          strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		AssemblyAIAPIKey:      strings.TrimSpace(os.Getenv("ASSEMBLYAI_API_KEY")),
		TranscriptionProvider: stringEnv("TRANSCRIPTION_PROVIDER", "openai"),
		ClamAVHost:            strings.TrimSpace(os.Getenv("CLAMAV_HOST")),
		ClamAVPort:            intEnv("CLAMAV_PORT", 3310),
		ClamAVTimeout:         time.Duration(intEnv("CLAMAV_TIMEOUT_MS", 5000)) * time.Millisecond,
		TurnstileSecretKey:    strings.TrimSpace(os.Getenv("TURNSTILE_SECRET_KEY")),
	}

	if cfg.MongoURI == "" {
		return cfg, errors.New("MONGODB_URI is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return cfg, errors.New("JWT_SECRET must be at least 32 characters")
	}
	if cfg.NodeEnv == "production" {
		if cfg.JWTRefreshSecret == "" {
			return cfg, errors.New("JWT_REFRESH_SECRET is required in production")
		}
		if cfg.JWTRefreshSecret == cfg.JWTSecret {
			return cfg, errors.New("JWT_REFRESH_SECRET must differ from JWT_SECRET")
		}
		if cfg.DataEncryptionKey == "" {
			return cfg, errors.New("DATA_ENCRYPTION_KEY is required in production")
		}
		if cfg.ClientOrigin == "" && len(cfg.ClientOrigins) == 0 {
			return cfg, errors.New("CLIENT_ORIGIN or CLIENT_ORIGINS is required in production")
		}
	}

	return cfg, nil
}

func (c Config) Addr() string {
	return fmt.Sprintf(":%d", c.Port)
}

func stringEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	if parsed, err := time.ParseDuration(value); err == nil {
		return parsed
	}
	if strings.HasSuffix(value, "m") {
		minutes, err := strconv.Atoi(strings.TrimSuffix(value, "m"))
		if err == nil {
			return time.Duration(minutes) * time.Minute
		}
	}
	return fallback
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}
