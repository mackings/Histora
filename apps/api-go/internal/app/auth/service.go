package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/mackings/histora/apps/api-go/internal/config"
	authdomain "github.com/mackings/histora/apps/api-go/internal/domain/auth"
	"github.com/mackings/histora/apps/api-go/internal/domain/session"
	"github.com/mackings/histora/apps/api-go/internal/domain/user"
	"github.com/mackings/histora/apps/api-go/internal/shared/apperror"
	"go.mongodb.org/mongo-driver/v2/bson"
	"golang.org/x/crypto/bcrypt"
)

const maxOTPAttempts = 5

type Service struct {
	cfg  config.Config
	repo *Repository
}

type RequestContext struct {
	IPAddress string
	UserAgent string
}

type DeviceContext struct {
	DeviceID   string
	DeviceName string
}

type AuthPayload struct {
	AccessToken  string       `json:"accessToken"`
	RefreshToken string       `json:"refreshToken"`
	User         AuthUserJSON `json:"user"`
}

type WebSocketTicket struct {
	Ticket    string `json:"ticket"`
	ExpiresIn int    `json:"expiresIn"`
}

type AuthUserJSON struct {
	ID               string `json:"id"`
	FullName         string `json:"fullName"`
	Username         string `json:"username"`
	Email            string `json:"email"`
	AvatarURL        string `json:"avatarUrl,omitempty"`
	SubscriptionTier string `json:"subscriptionTier"`
	EmailVerified    bool   `json:"emailVerified,omitempty"`
}

type RegisterInput struct {
	FullName    string `json:"fullName"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	DateOfBirth string `json:"dateOfBirth,omitempty"`
}

type LoginInput struct {
	Email      string `json:"email"`
	Password   string `json:"password"`
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
}

type VerifyDeviceInput struct {
	ChallengeID string `json:"challengeId"`
	Email       string `json:"email"`
	OTP         string `json:"otp"`
	DeviceID    string `json:"deviceId"`
	DeviceName  string `json:"deviceName"`
}

type ResendDeviceVerificationInput struct {
	Email      string `json:"email"`
	DeviceID   string `json:"deviceId"`
	DeviceName string `json:"deviceName"`
}

type VerifyEmailInput struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

type EmailInput struct {
	Email string `json:"email"`
}

type ResetPasswordInput struct {
	Code     string `json:"code"`
	Password string `json:"password"`
}

func NewService(cfg config.Config, repo *Repository) *Service {
	return &Service{cfg: cfg, repo: repo}
}

func (s *Service) Register(ctx context.Context, input RegisterInput) (map[string]any, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	username := strings.ToLower(strings.TrimSpace(input.Username))
	if len(input.FullName) < 2 || len(username) < 3 || len(input.Password) < 8 || email == "" {
		return nil, apperror.BadRequest("Invalid registration payload")
	}

	existing, err := s.repo.FindUserByEmailOrUsername(ctx, email, username)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, apperror.New(409, "Email or username already exists")
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		return nil, err
	}

	created, err := s.repo.CreateUser(ctx, user.User{
		FullName:     strings.TrimSpace(input.FullName),
		Username:     username,
		Email:        email,
		PasswordHash: string(passwordHash),
	})
	if err != nil {
		return nil, err
	}

	otp, err := s.issueEmailVerificationOTP(ctx, created.ID, created.Email)
	if err != nil {
		return nil, err
	}

	response := map[string]any{"ok": true, "email": created.Email, "verificationRequired": true}
	if s.cfg.NodeEnv != "production" {
		response["otp"] = otp
	}
	return response, nil
}

func (s *Service) Login(ctx context.Context, input LoginInput, requestCtx RequestContext) (*AuthPayload, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	foundUser, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if foundUser == nil {
		return nil, apperror.Unauthorized("Invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(foundUser.PasswordHash), []byte(input.Password)); err != nil {
		return nil, apperror.Unauthorized("Invalid credentials")
	}
	if !foundUser.EmailVerified {
		return nil, apperror.Error{Status: 403, Message: "Verify your email before signing in.", Code: "EMAIL_NOT_VERIFIED"}
	}

	deviceKeyHash := hashString(input.DeviceID)
	trusted, err := s.repo.FindTrustedDevice(ctx, foundUser.ID, deviceKeyHash)
	if err != nil {
		return nil, err
	}
	if trusted == nil {
		if input.DeviceID != "" {
			challenge, _, err := s.issueDeviceVerificationChallenge(ctx, *foundUser, DeviceContext{DeviceID: input.DeviceID, DeviceName: input.DeviceName}, requestCtx)
			if err != nil {
				return nil, err
			}
			return nil, apperror.Error{
				Status:  403,
				Message: "This device must be approved before sign in.",
				Code:    "DEVICE_VERIFICATION_REQUIRED",
				Details: map[string]any{"challengeId": challenge.ID.Hex(), "email": foundUser.Email, "deviceName": input.DeviceName},
			}
		}
	}

	return s.createSessionPayload(ctx, foundUser, requestCtx, DeviceContext{DeviceID: input.DeviceID, DeviceName: input.DeviceName})
}

func (s *Service) VerifyDevice(ctx context.Context, input VerifyDeviceInput, requestCtx RequestContext) (*AuthPayload, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	deviceID := strings.TrimSpace(input.DeviceID)
	if email == "" || deviceID == "" {
		return nil, apperror.BadRequest("Device verification payload is incomplete.")
	}
	challengeID, err := bson.ObjectIDFromHex(strings.TrimSpace(input.ChallengeID))
	if err != nil {
		return nil, apperror.Error{Status: 400, Message: "Device verification code is invalid or expired.", Code: "INVALID_DEVICE_VERIFICATION_CODE"}
	}
	deviceKeyHash := hashString(deviceID)
	challenge, err := s.repo.FindActiveDeviceChallenge(ctx, challengeID, email, deviceKeyHash)
	if err != nil {
		return nil, err
	}
	if challenge == nil {
		return nil, apperror.Error{Status: 400, Message: "Device verification code is invalid or expired.", Code: "INVALID_DEVICE_VERIFICATION_CODE"}
	}
	if challenge.FailedAttempts >= maxOTPAttempts {
		_ = s.repo.DeleteActiveDeviceChallenges(ctx, challenge.UserID, challenge.DeviceKeyHash)
		return nil, apperror.Error{Status: 429, Message: "Too many incorrect device codes. Request a new device approval code.", Code: "DEVICE_VERIFICATION_ATTEMPTS_EXCEEDED"}
	}
	if challenge.OTPHash != hashString(strings.TrimSpace(input.OTP)) {
		nextAttempts := challenge.FailedAttempts + 1
		_ = s.repo.UpdateDeviceChallengeAttempt(ctx, challenge.ID, nextAttempts)
		if nextAttempts >= maxOTPAttempts {
			return nil, apperror.Error{Status: 429, Message: "Too many incorrect device codes. Request a new device approval code.", Code: "DEVICE_VERIFICATION_ATTEMPTS_EXCEEDED"}
		}
		return nil, apperror.Error{Status: 400, Message: "Device verification code is invalid or expired.", Code: "INVALID_DEVICE_VERIFICATION_CODE"}
	}
	foundUser, err := s.repo.FindUserByID(ctx, challenge.UserID)
	if err != nil {
		return nil, err
	}
	if foundUser == nil || !foundUser.EmailVerified {
		return nil, apperror.Error{Status: 403, Message: "Verify your email before approving a device.", Code: "EMAIL_NOT_VERIFIED"}
	}
	deviceName := strings.TrimSpace(input.DeviceName)
	if deviceName == "" {
		deviceName = challenge.DeviceLabel
	}
	if deviceName == "" {
		deviceName = "Trusted device"
	}
	if err := s.repo.UpsertTrustedDevice(ctx, authdomain.TrustedDevice{
		UserID:        foundUser.ID,
		DeviceKeyHash: challenge.DeviceKeyHash,
		Label:         deviceName,
		UserAgent:     fallbackString(requestCtx.UserAgent, challenge.UserAgent),
		LastIPAddress: fallbackString(requestCtx.IPAddress, challenge.IPAddress),
	}); err != nil {
		return nil, err
	}
	if err := s.repo.ConsumeDeviceChallenge(ctx, challenge.ID); err != nil {
		return nil, err
	}
	_ = s.repo.DeleteActiveDeviceChallenges(ctx, foundUser.ID, challenge.DeviceKeyHash)
	return s.createSessionPayload(ctx, foundUser, requestCtx, DeviceContext{DeviceID: deviceID, DeviceName: deviceName})
}

func (s *Service) ResendDeviceVerification(ctx context.Context, input ResendDeviceVerificationInput, requestCtx RequestContext) (map[string]any, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	deviceID := strings.TrimSpace(input.DeviceID)
	if email == "" || deviceID == "" {
		return nil, apperror.BadRequest("Device verification payload is incomplete.")
	}
	foundUser, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if foundUser == nil {
		return map[string]any{"ok": true}, nil
	}
	if !foundUser.EmailVerified {
		return nil, apperror.Error{Status: 403, Message: "Verify your email before approving a device.", Code: "EMAIL_NOT_VERIFIED"}
	}
	deviceKeyHash := hashString(deviceID)
	trusted, err := s.repo.FindTrustedDevice(ctx, foundUser.ID, deviceKeyHash)
	if err != nil {
		return nil, err
	}
	if trusted != nil {
		return map[string]any{"ok": true, "alreadyTrusted": true}, nil
	}
	challenge, otp, err := s.issueDeviceVerificationChallenge(ctx, *foundUser, DeviceContext{DeviceID: deviceID, DeviceName: input.DeviceName}, requestCtx)
	if err != nil {
		return nil, err
	}
	response := map[string]any{"ok": true, "challengeId": challenge.ID.Hex(), "email": foundUser.Email, "deviceName": input.DeviceName}
	if s.cfg.NodeEnv != "production" {
		response["otp"] = otp
	}
	return response, nil
}

func (s *Service) Me(ctx context.Context, userID bson.ObjectID) (AuthUserJSON, error) {
	foundUser, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return AuthUserJSON{}, err
	}
	if foundUser == nil {
		return AuthUserJSON{}, apperror.NotFound("User not found")
	}
	return userJSON(*foundUser), nil
}

func (s *Service) VerifyEmail(ctx context.Context, input VerifyEmailInput) (map[string]any, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	foundUser, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if foundUser == nil {
		return nil, apperror.Error{Status: 400, Message: "Verification code is invalid or expired.", Code: "INVALID_VERIFICATION_CODE"}
	}

	token, err := s.repo.FindActiveEmailToken(ctx, foundUser.ID, email)
	if err != nil {
		return nil, err
	}
	if token == nil {
		return nil, apperror.Error{Status: 400, Message: "Verification code is invalid or expired.", Code: "INVALID_VERIFICATION_CODE"}
	}
	if token.FailedAttempts >= maxOTPAttempts {
		_ = s.repo.DeleteActiveEmailTokens(ctx, foundUser.ID)
		return nil, apperror.Error{Status: 429, Message: "Too many incorrect codes. Request a new verification code.", Code: "VERIFICATION_ATTEMPTS_EXCEEDED"}
	}
	if token.CodeHash != hashString(strings.TrimSpace(input.OTP)) {
		nextAttempts := token.FailedAttempts + 1
		_ = s.repo.UpdateEmailTokenAttempt(ctx, token.ID, nextAttempts)
		if nextAttempts >= maxOTPAttempts {
			return nil, apperror.Error{Status: 429, Message: "Too many incorrect codes. Request a new verification code.", Code: "VERIFICATION_ATTEMPTS_EXCEEDED"}
		}
		return nil, apperror.Error{Status: 400, Message: "Verification code is invalid or expired.", Code: "INVALID_VERIFICATION_CODE"}
	}

	if err := s.repo.MarkUserEmailVerified(ctx, foundUser.ID); err != nil {
		return nil, err
	}
	if err := s.repo.ConsumeEmailToken(ctx, token.ID); err != nil {
		return nil, err
	}
	_ = s.repo.DeleteActiveEmailTokens(ctx, foundUser.ID)
	return map[string]any{"ok": true, "email": email}, nil
}

func (s *Service) ResendEmailVerification(ctx context.Context, input EmailInput) (map[string]any, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	foundUser, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if foundUser == nil {
		return map[string]any{"ok": true}, nil
	}
	if foundUser.EmailVerified {
		return map[string]any{"ok": true, "alreadyVerified": true}, nil
	}
	otp, err := s.issueEmailVerificationOTP(ctx, foundUser.ID, foundUser.Email)
	if err != nil {
		return nil, err
	}
	response := map[string]any{"ok": true, "email": foundUser.Email, "verificationRequired": true}
	if s.cfg.NodeEnv != "production" {
		response["otp"] = otp
	}
	return response, nil
}

func (s *Service) Refresh(ctx context.Context, refreshToken string, requestCtx RequestContext) (*AuthPayload, error) {
	if refreshToken == "" {
		return nil, apperror.Unauthorized("Refresh token is required")
	}

	claims, err := s.verifyToken(refreshToken, true)
	if err != nil {
		return nil, apperror.Unauthorized("Invalid or expired refresh token")
	}

	sessionID, err := bson.ObjectIDFromHex(claims.SessionID)
	if err != nil {
		return nil, apperror.Unauthorized("Invalid refresh token payload")
	}
	existingSession, err := s.repo.FindSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if existingSession == nil || existingSession.RevokedAt != nil || existingSession.ExpiresAt.Before(time.Now()) {
		return nil, apperror.Unauthorized("Refresh session is no longer valid")
	}
	if existingSession.TokenHash != hashString(refreshToken) {
		_ = s.repo.RevokeSessionFamily(ctx, existingSession.Family)
		return nil, apperror.Unauthorized("Refresh token reuse detected")
	}

	userID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil {
		return nil, apperror.Unauthorized("Invalid refresh token payload")
	}
	foundUser, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if foundUser == nil {
		return nil, apperror.NotFound("User not found")
	}

	nextSession, err := s.repo.CreateSession(ctx, session.Session{
		UserID:          userID,
		TokenHash:       uuid.NewString(),
		Family:          existingSession.Family,
		ParentSessionID: &existingSession.ID,
		DeviceKeyHash:   existingSession.DeviceKeyHash,
		DeviceLabel:     existingSession.DeviceLabel,
		UserAgent:       fallbackString(requestCtx.UserAgent, existingSession.UserAgent),
		IPAddress:       fallbackString(requestCtx.IPAddress, existingSession.IPAddress),
		ExpiresAt:       time.Now().Add(time.Duration(s.cfg.RefreshTokenTTLDays) * 24 * time.Hour),
	})
	if err != nil {
		return nil, err
	}
	nextRefresh, err := s.buildRefreshToken(nextSession.ID.Hex(), userID.Hex())
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateSessionTokenHash(ctx, nextSession.ID, hashString(nextRefresh)); err != nil {
		return nil, err
	}
	_ = s.repo.RevokeSession(ctx, existingSession.ID)

	access, err := s.buildAccessToken(userID.Hex(), nextSession.ID.Hex())
	if err != nil {
		return nil, err
	}
	return &AuthPayload{AccessToken: access, RefreshToken: nextRefresh, User: userJSON(*foundUser)}, nil
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	claims, err := s.verifyToken(refreshToken, true)
	if err != nil {
		return nil
	}
	sessionID, err := bson.ObjectIDFromHex(claims.SessionID)
	if err != nil {
		return nil
	}
	return s.repo.RevokeSession(ctx, sessionID)
}

func (s *Service) ForgotPassword(ctx context.Context, input EmailInput) (map[string]any, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	foundUser, err := s.repo.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if foundUser == nil {
		return map[string]any{"ok": true}, nil
	}
	code, err := randomHexCode(3)
	if err != nil {
		return nil, err
	}
	_ = s.repo.DeleteActivePasswordResetTokens(ctx, foundUser.ID)
	_, err = s.repo.CreatePasswordResetToken(ctx, authdomain.PasswordResetToken{
		UserID:    foundUser.ID,
		CodeHash:  hashString(code),
		ExpiresAt: time.Now().Add(15 * time.Minute),
	})
	if err != nil {
		return nil, err
	}
	response := map[string]any{"ok": true}
	if s.cfg.NodeEnv != "production" {
		response["resetCode"] = code
	}
	return response, nil
}

func (s *Service) ResetPassword(ctx context.Context, input ResetPasswordInput) (map[string]any, error) {
	codeHash := hashString(strings.ToUpper(strings.TrimSpace(input.Code)))
	token, err := s.repo.FindActivePasswordResetTokenByHash(ctx, codeHash)
	if err != nil {
		return nil, err
	}
	if token == nil {
		return nil, apperror.BadRequest("Reset code is invalid or expired")
	}
	if len(input.Password) < 8 {
		return nil, apperror.BadRequest("Password must be at least 8 characters")
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(input.Password), 12)
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateUserPasswordHash(ctx, token.UserID, string(passwordHash)); err != nil {
		return nil, err
	}
	if err := s.repo.ConsumePasswordResetToken(ctx, token.ID); err != nil {
		return nil, err
	}
	_ = s.repo.RevokeActiveUserSessions(ctx, token.UserID)
	return map[string]any{"ok": true}, nil
}

func (s *Service) createSessionPayload(ctx context.Context, foundUser *user.User, requestCtx RequestContext, device DeviceContext) (*AuthPayload, error) {
	deviceKeyHash := ""
	if device.DeviceID != "" {
		deviceKeyHash = hashString(device.DeviceID)
	}
	newSession, err := s.repo.CreateSession(ctx, session.Session{
		UserID:        foundUser.ID,
		TokenHash:     uuid.NewString(),
		Family:        uuid.NewString(),
		DeviceKeyHash: deviceKeyHash,
		DeviceLabel:   device.DeviceName,
		UserAgent:     requestCtx.UserAgent,
		IPAddress:     requestCtx.IPAddress,
		ExpiresAt:     time.Now().Add(time.Duration(s.cfg.RefreshTokenTTLDays) * 24 * time.Hour),
	})
	if err != nil {
		return nil, err
	}
	refresh, err := s.buildRefreshToken(newSession.ID.Hex(), foundUser.ID.Hex())
	if err != nil {
		return nil, err
	}
	if err := s.repo.UpdateSessionTokenHash(ctx, newSession.ID, hashString(refresh)); err != nil {
		return nil, err
	}
	access, err := s.buildAccessToken(foundUser.ID.Hex(), newSession.ID.Hex())
	if err != nil {
		return nil, err
	}
	return &AuthPayload{AccessToken: access, RefreshToken: refresh, User: userJSON(*foundUser)}, nil
}

type tokenClaims struct {
	Subject   string `json:"sub"`
	SessionID string `json:"sid"`
	Type      string `json:"typ"`
	jwt.RegisteredClaims
}

func (s *Service) buildAccessToken(userID, sessionID string) (string, error) {
	return s.buildToken(userID, sessionID, "access", []byte(s.cfg.JWTSecret), time.Now().Add(s.cfg.AccessTokenTTL))
}

func (s *Service) buildRefreshToken(sessionID, userID string) (string, error) {
	secret := s.cfg.JWTRefreshSecret
	if secret == "" {
		secret = s.cfg.JWTSecret
	}
	return s.buildToken(userID, sessionID, "refresh", []byte(secret), time.Now().Add(time.Duration(s.cfg.RefreshTokenTTLDays)*24*time.Hour))
}

func (s *Service) buildToken(userID, sessionID, tokenType string, secret []byte, expiresAt time.Time) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, tokenClaims{
		Subject:   userID,
		SessionID: sessionID,
		Type:      tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})
	return token.SignedString(secret)
}

func (s *Service) VerifyAccessToken(tokenValue string) (bson.ObjectID, string, error) {
	claims, err := s.verifyToken(tokenValue, false)
	if err != nil {
		return bson.NilObjectID, "", err
	}
	userID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil {
		return bson.NilObjectID, "", err
	}
	return userID, claims.SessionID, nil
}

func (s *Service) IssueWebSocketTicket(userID bson.ObjectID, sessionID, scope string) (WebSocketTicket, error) {
	scope = normalizeWebSocketScope(scope)
	if scope == "" || sessionID == "" {
		return WebSocketTicket{}, apperror.BadRequest("Invalid WebSocket ticket request")
	}
	const ttl = 60
	ticket, err := s.buildToken(userID.Hex(), sessionID, "ws:"+scope, []byte(s.cfg.JWTSecret), time.Now().Add(ttl*time.Second))
	if err != nil {
		return WebSocketTicket{}, err
	}
	return WebSocketTicket{Ticket: ticket, ExpiresIn: ttl}, nil
}

func (s *Service) VerifyWebSocketTicket(tokenValue, scope string) (bson.ObjectID, string, error) {
	expectedType := "ws:" + normalizeWebSocketScope(scope)
	if expectedType == "ws:" {
		return bson.NilObjectID, "", fmt.Errorf("invalid websocket scope")
	}
	claims, err := s.verifyTypedToken(tokenValue, s.cfg.JWTSecret, expectedType)
	if err != nil {
		return bson.NilObjectID, "", err
	}
	userID, err := bson.ObjectIDFromHex(claims.Subject)
	if err != nil {
		return bson.NilObjectID, "", err
	}
	return userID, claims.SessionID, nil
}

func (s *Service) verifyToken(tokenValue string, refresh bool) (*tokenClaims, error) {
	secret := s.cfg.JWTSecret
	expectedType := "access"
	if refresh {
		expectedType = "refresh"
		if s.cfg.JWTRefreshSecret != "" {
			secret = s.cfg.JWTRefreshSecret
		}
	}
	return s.verifyTypedToken(tokenValue, secret, expectedType)
}

func (s *Service) verifyTypedToken(tokenValue, secret, expectedType string) (*tokenClaims, error) {
	claims := &tokenClaims{}
	token, err := jwt.ParseWithClaims(tokenValue, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || token == nil || !token.Valid || claims.Type != expectedType {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

func normalizeWebSocketScope(scope string) string {
	switch strings.TrimSpace(scope) {
	case "events":
		return "events"
	case "transcription":
		return "transcription"
	default:
		return ""
	}
}

func (s *Service) issueEmailVerificationOTP(ctx context.Context, userID bson.ObjectID, email string) (string, error) {
	recent, err := s.repo.FindRecentActiveEmailToken(ctx, userID)
	if err != nil {
		return "", err
	}
	if recent != nil && time.Since(recent.CreatedAt) < time.Minute {
		return "", apperror.Error{Status: 429, Message: "Please wait a minute before requesting another code.", Code: "VERIFICATION_RESEND_COOLDOWN"}
	}
	_ = s.repo.DeleteActiveEmailTokens(ctx, userID)
	otp, err := randomNumericCode(5)
	if err != nil {
		return "", err
	}
	_, err = s.repo.CreateEmailToken(ctx, authdomain.EmailVerificationToken{
		UserID:    userID,
		Email:     email,
		CodeHash:  hashString(otp),
		ExpiresAt: time.Now().Add(10 * time.Minute),
	})
	if err != nil {
		return "", err
	}
	if err := s.sendVerificationEmail(email, otp); err != nil {
		_ = s.repo.DeleteActiveEmailTokens(ctx, userID)
		return "", err
	}
	return otp, nil
}

func (s *Service) issueDeviceVerificationChallenge(ctx context.Context, u user.User, device DeviceContext, requestCtx RequestContext) (*authdomain.DeviceVerificationChallenge, string, error) {
	deviceID := strings.TrimSpace(device.DeviceID)
	deviceName := strings.TrimSpace(device.DeviceName)
	if deviceID == "" {
		return nil, "", apperror.BadRequest("Device id is required.")
	}
	if deviceName == "" {
		deviceName = "New device"
	}
	deviceKeyHash := hashString(deviceID)
	recent, err := s.repo.FindRecentActiveDeviceChallenge(ctx, u.ID, deviceKeyHash)
	if err != nil {
		return nil, "", err
	}
	if recent != nil && time.Since(recent.CreatedAt) < time.Minute {
		return nil, "", apperror.Error{Status: 429, Message: "A device approval code was already sent. Check your email or wait a minute.", Code: "DEVICE_VERIFICATION_COOLDOWN"}
	}
	_ = s.repo.DeleteActiveDeviceChallenges(ctx, u.ID, deviceKeyHash)
	otp, err := randomNumericCode(5)
	if err != nil {
		return nil, "", err
	}
	challenge, err := s.repo.CreateDeviceChallenge(ctx, authdomain.DeviceVerificationChallenge{
		UserID:        u.ID,
		Email:         u.Email,
		DeviceKeyHash: deviceKeyHash,
		DeviceLabel:   deviceName,
		UserAgent:     requestCtx.UserAgent,
		IPAddress:     requestCtx.IPAddress,
		OTPHash:       hashString(otp),
		ExpiresAt:     time.Now().Add(10 * time.Minute),
	})
	if err != nil {
		return nil, "", err
	}
	if err := s.sendDeviceVerificationEmail(u.Email, otp, deviceName); err != nil {
		_ = s.repo.DeleteActiveDeviceChallenges(ctx, u.ID, deviceKeyHash)
		return nil, "", err
	}
	return challenge, otp, nil
}

func hashString(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}

func randomNumericCode(length int) (string, error) {
	var builder strings.Builder
	for builder.Len() < length {
		n, err := rand.Int(rand.Reader, big.NewInt(10))
		if err != nil {
			return "", err
		}
		builder.WriteString(n.String())
	}
	return builder.String(), nil
}

func randomHexCode(bytesLen int) (string, error) {
	buffer := make([]byte, bytesLen)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return strings.ToUpper(hex.EncodeToString(buffer)), nil
}

func (s *Service) sendVerificationEmail(email, otp string) error {
	return s.sendEmail(email, "Histora verification code", "Your Histora verification code is "+otp+". It expires in 10 minutes.", []string{
		"Verify your email",
		"Use this 5-digit code to verify your Histora account.",
		otp,
		"This code expires in 10 minutes.",
	})
}

func (s *Service) sendDeviceVerificationEmail(email, otp, deviceLabel string) error {
	return s.sendEmail(email, "Histora device approval code", "A sign-in attempt from "+deviceLabel+" needs approval. Your Histora device code is "+otp+". It expires in 10 minutes.", []string{
		"Approve this device",
		"A new device is trying to sign in to your archive.",
		"Device: " + deviceLabel,
		"Code: " + otp,
		"This code expires in 10 minutes. If this was not you, ignore this email.",
	})
}

func (s *Service) sendEmail(to, subject, text string, lines []string) error {
	if s.cfg.MailjetAPIKey != "" && s.cfg.MailjetAPISecret != "" && s.cfg.MailjetFromEmail != "" {
		return s.sendMailjetEmail(to, subject, text, lines)
	}
	if s.cfg.SMTPUser == "" || s.cfg.SMTPPassword == "" {
		if s.cfg.NodeEnv == "production" {
			return apperror.Error{Status: 500, Message: "SMTP is not configured on the server.", Code: "SMTP_NOT_CONFIGURED"}
		}
		return nil
	}
	host := strings.TrimSpace(s.cfg.SMTPHost)
	if host == "" {
		host = "smtp.gmail.com"
	}
	port := s.cfg.SMTPPort
	if port == 0 {
		port = 465
	}
	fromName := fallbackString(s.cfg.SMTPFromName, "Histora")
	from := fmt.Sprintf("%s <%s>", fromName, s.cfg.SMTPUser)
	htmlLines := make([]string, 0, len(lines))
	for _, line := range lines {
		htmlLines = append(htmlLines, "<p>"+htmlEscape(line)+"</p>")
	}
	message := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		`Content-Type: multipart/alternative; boundary="histora-boundary"`,
		"",
		"--histora-boundary",
		"Content-Type: text/plain; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte(text)),
		"--histora-boundary",
		"Content-Type: text/html; charset=UTF-8",
		"Content-Transfer-Encoding: base64",
		"",
		base64.StdEncoding.EncodeToString([]byte(`<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">` + strings.Join(htmlLines, "") + "</div>")),
		"--histora-boundary--",
		"",
	}, "\r\n")

	addr := net.JoinHostPort(host, strconv.Itoa(port))
	auth := smtp.PlainAuth("", s.cfg.SMTPUser, s.cfg.SMTPPassword, host)
	timeout := 10 * time.Second
	dialer := net.Dialer{Timeout: timeout}
	if port == 465 {
		conn, err := tls.DialWithDialer(&dialer, "tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
		if err != nil {
			return err
		}
		_ = conn.SetDeadline(time.Now().Add(timeout))
		defer conn.Close()
		client, err := smtp.NewClient(conn, host)
		if err != nil {
			return err
		}
		defer client.Quit()
		return sendSMTPMessage(client, auth, s.cfg.SMTPUser, to, []byte(message))
	}
	conn, err := dialer.Dial("tcp", addr)
	if err != nil {
		return err
	}
	_ = conn.SetDeadline(time.Now().Add(timeout))
	defer conn.Close()
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Quit()
	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return err
		}
	}
	return sendSMTPMessage(client, auth, s.cfg.SMTPUser, to, []byte(message))
}

func (s *Service) sendMailjetEmail(to, subject, text string, lines []string) error {
	htmlLines := make([]string, 0, len(lines))
	for _, line := range lines {
		htmlLines = append(htmlLines, "<p>"+htmlEscape(line)+"</p>")
	}
	body := map[string]any{
		"Messages": []map[string]any{
			{
				"From": map[string]string{
					"Email": s.cfg.MailjetFromEmail,
					"Name":  fallbackString(s.cfg.MailjetFromName, "Histora"),
				},
				"To": []map[string]string{
					{"Email": to},
				},
				"Subject":  subject,
				"TextPart": text,
				"HTMLPart": `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">` + strings.Join(htmlLines, "") + "</div>",
			},
		},
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, "https://api.mailjet.com/v3.1/send", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.SetBasicAuth(s.cfg.MailjetAPIKey, s.cfg.MailjetAPISecret)
	req.Header.Set("Content-Type", "application/json")
	client := http.Client{Timeout: 15 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		var out struct {
			ErrorMessage string `json:"ErrorMessage"`
			Messages     []struct {
				Errors []struct {
					ErrorMessage string `json:"ErrorMessage"`
					ErrorCode    string `json:"ErrorCode"`
				} `json:"Errors"`
			} `json:"Messages"`
		}
		_ = json.NewDecoder(res.Body).Decode(&out)
		message := out.ErrorMessage
		if message == "" && len(out.Messages) > 0 && len(out.Messages[0].Errors) > 0 {
			message = out.Messages[0].Errors[0].ErrorMessage
		}
		if message == "" {
			message = "Mailjet email delivery failed."
		}
		return apperror.Error{Status: 502, Message: message, Code: "EMAIL_DELIVERY_FAILED"}
	}
	return nil
}

func htmlEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")
	return replacer.Replace(value)
}

func sendSMTPMessage(client *smtp.Client, auth smtp.Auth, from, to string, message []byte) error {
	if ok, _ := client.Extension("AUTH"); ok {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}
	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(message); err != nil {
		_ = writer.Close()
		return err
	}
	return writer.Close()
}

func userJSON(u user.User) AuthUserJSON {
	return AuthUserJSON{
		ID:               u.ID.Hex(),
		FullName:         u.FullName,
		Username:         u.Username,
		Email:            u.Email,
		AvatarURL:        u.AvatarURL,
		SubscriptionTier: fallbackString(u.SubscriptionTier, "free"),
		EmailVerified:    u.EmailVerified,
	}
}

func fallbackString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
