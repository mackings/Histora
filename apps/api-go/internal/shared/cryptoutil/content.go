package cryptoutil

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
)

const EncryptedContentPlaceholder = "[encrypted]"

func DecryptJSON[T any](encryptionKey string, payload string) (*T, error) {
	if strings.TrimSpace(payload) == "" {
		return nil, nil
	}
	decrypted, err := DecryptSensitiveValue(encryptionKey, payload)
	if err != nil {
		return nil, err
	}
	var out T
	if err := json.Unmarshal([]byte(decrypted), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func EncryptJSON(encryptionKey string, value any) (string, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return EncryptSensitiveValue(encryptionKey, string(payload))
}

func EncryptSensitiveValue(encryptionKey string, value string) (string, error) {
	if strings.TrimSpace(value) == "" {
		return "", errors.New("cannot encrypt an empty value")
	}
	if strings.TrimSpace(encryptionKey) == "" {
		return "", errors.New("data encryption key is not configured")
	}
	key := sha256.Sum256([]byte(encryptionKey))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	iv := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nil, iv, []byte(value), nil)
	tagSize := gcm.Overhead()
	encrypted := sealed[:len(sealed)-tagSize]
	tag := sealed[len(sealed)-tagSize:]
	return base64.StdEncoding.EncodeToString(iv) + "." +
		base64.StdEncoding.EncodeToString(tag) + "." +
		base64.StdEncoding.EncodeToString(encrypted), nil
}

func DecryptSensitiveValue(encryptionKey string, payload string) (string, error) {
	if strings.TrimSpace(encryptionKey) == "" {
		return "", errors.New("data encryption key is not configured")
	}
	parts := strings.Split(payload, ".")
	if len(parts) != 3 {
		return "", errors.New("encrypted payload is malformed")
	}
	iv, err := base64.StdEncoding.DecodeString(parts[0])
	if err != nil {
		return "", err
	}
	tag, err := base64.StdEncoding.DecodeString(parts[1])
	if err != nil {
		return "", err
	}
	encrypted, err := base64.StdEncoding.DecodeString(parts[2])
	if err != nil {
		return "", err
	}
	key := sha256.Sum256([]byte(encryptionKey))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	ciphertextWithTag := append(encrypted, tag...)
	plain, err := gcm.Open(nil, iv, ciphertextWithTag, nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
