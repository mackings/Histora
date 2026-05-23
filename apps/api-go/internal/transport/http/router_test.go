package httptransport

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mackings/histora/apps/api-go/internal/app/health"
	"github.com/mackings/histora/apps/api-go/internal/config"
)

func TestRouterHealth(t *testing.T) {
	router := NewRouter(Deps{
		Config: config.Config{NodeEnv: "test"},
		Health: health.Service{},
	})

	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}

	var payload struct {
		OK bool `json:"ok"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !payload.OK {
		t.Fatal("expected ok health payload")
	}
}

func TestRouterScaffoldedAPIRouteReturnsNotImplemented(t *testing.T) {
	router := NewRouter(Deps{
		Config: config.Config{NodeEnv: "test"},
		Health: health.Service{},
	})

	request := httptest.NewRequest(http.MethodGet, "/api/stories/feed", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusNotImplemented {
		t.Fatalf("expected 501, got %d", response.Code)
	}
}
