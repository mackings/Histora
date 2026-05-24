package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
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
		// Keep first Go migration pass usable for existing accounts while still producing
		// the same error shape when a device id is supplied but not approved.
		if input.DeviceID != "" {
			return nil, apperror.Error{
				Status:  403,
				Message: "This device must be approved before sign in.",
				Code:    "DEVICE_VERIFICATION_REQUIRED",
				Details: map[string]any{"email": foundUser.Email, "deviceName": input.DeviceName},
			}
		}
	}

	return s.createSessionPayload(ctx, foundUser, requestCtx, DeviceContext{DeviceID: input.DeviceID, DeviceName: input.DeviceName})
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

func (s *Service) verifyToken(tokenValue string, refresh bool) (*tokenClaims, error) {
	secret := s.cfg.JWTSecret
	expectedType := "access"
	if refresh {
		expectedType = "refresh"
		if s.cfg.JWTRefreshSecret != "" {
			secret = s.cfg.JWTRefreshSecret
		}
	}
	claims := &tokenClaims{}
	_, err := jwt.ParseWithClaims(tokenValue, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil || claims.Type != expectedType {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}

func (s *Service) issueEmailVerificationOTP(ctx context.Context, userID bson.ObjectID, email string) (string, error) {
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
	return otp, err
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
