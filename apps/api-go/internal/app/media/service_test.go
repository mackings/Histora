package media

import "testing"

func TestValidateUploadRejectsMismatchedContentType(t *testing.T) {
	err := validateUpload([]byte("not-a-real-image"), "image/png")
	if err == nil {
		t.Fatal("expected mismatched upload to be rejected")
	}
}

func TestValidateUploadAcceptsPNGMagic(t *testing.T) {
	body := []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00}
	if err := validateUpload(body, "image/png"); err != nil {
		t.Fatalf("expected png upload to pass validation: %v", err)
	}
}

func TestBuildObjectKeyIsScopedToUser(t *testing.T) {
	key := buildObjectKey("user-123", "../Unsafe Name.png", "image/png")
	if key[:len("users/user-123/")] != "users/user-123/" {
		t.Fatalf("expected user-scoped key, got %q", key)
	}
	if key[len(key)-4:] != ".png" {
		t.Fatalf("expected png extension, got %q", key)
	}
}
