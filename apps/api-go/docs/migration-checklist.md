# Go Migration Checklist

The Node API remains the production source of truth until every item below has route parity and data parity.

## Infrastructure

- [x] HTTP server with graceful shutdown.
- [x] `/` and `/health`.
- [x] MongoDB connection using existing collections.
- [x] Redis command/subscriber clients.
- [x] Clean architecture folder split.
- [x] Route map matching current `/api/*` surface.
- [ ] Redis rate limiting.
- [ ] Redis cache helpers.
- [x] Redis pub/sub app events.
- [x] WebSocket `/ws/events`.
- [x] WebSocket `/ws/transcription`.
- [ ] Queue worker replacement or deliberate BullMQ bridge.
  - [x] Redis Streams counter-worker scaffold.
  - [x] Counter reconciliation logic.
- [ ] Structured request IDs through logs and responses.

## Feature Parity

- [x] Auth register/login/refresh/logout.
- [x] Email verification and password reset.
- [ ] Trusted device verification.
- [x] Profile dashboard, sessions, devices, push subscriptions.
- [x] Follow system.
- [x] Collaboration invites.
- [ ] Stories feed, mine, collaborative, public story, create/update.
  - [x] Read paths: feed, mine, collaborative, mine by id, public by slug.
  - [x] Write paths: create/update, revision conflicts, encrypted writes.
  - [ ] Realtime collaboration broadcasts.
- [x] Story reactions, bookmarks, shares, read tracking.
- [ ] Studio collaboration realtime updates.
- [x] Comments create/list for status, story chapter, anonymous message.
- [x] Status feed/create/reactions/delete/share.
  - [x] Feed, mine, create, delete, anonymous share lookup.
  - [x] Reactions.
- [x] Anonymous messages and helper contact flow.
- [x] Media signed upload/direct upload/signed read.
- [x] Transcription create and streaming token.

## Cutover Gates

- [x] Go tests pass with unit and handler coverage.
- [ ] Contract smoke tests pass against the web app's expected responses.
- [ ] Seed/e2e scripts pass against Go API.
- [ ] Production env variables verified.
- [ ] Render deploy health checks pass.
- [ ] Rollback plan documented.
