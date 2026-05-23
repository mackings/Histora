# Histora Go API

This is the parallel Go rewrite of the Histora backend. It is intentionally kept beside the existing Node API until route parity, data parity, and smoke tests pass.

Important migration notes:

- Go cannot use Mongoose. Mongoose is a Node ODM. This service uses the official MongoDB Go driver and keeps the existing Mongo collection names and document shapes.
- The existing BullMQ queue is Node-specific. Go can share Redis, but BullMQ compatibility requires either keeping the Node worker during migration or replacing the queue with a Go-owned Redis Streams/asynq worker after a controlled cutover.
- Production should not point to this service until `/api/*`, `/ws/events`, `/ws/transcriptions`, media, auth, and collaboration behavior are covered by parity tests.

## Layout

- `cmd/api`: executable entrypoint.
- `internal/config`: environment parsing.
- `internal/domain`: Mongo document/domain models.
- `internal/app`: use cases by feature.
- `internal/platform`: Mongo, Redis, jobs, realtime, and server adapters.
- `internal/transport/http`: HTTP routes and middleware.
- `internal/shared`: shared response, error, and app context utilities.

## Local Commands

```sh
go mod tidy
go test ./...
go run ./cmd/api
```
