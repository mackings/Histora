package httpserver

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

func Run(ctx context.Context, server *http.Server) error {
	errCh := make(chan error, 1)
	go func() {
		slog.Info("Histora Go API listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
			return
		}
		errCh <- nil
	}()

	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return server.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}
