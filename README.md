# Histora

Histora is a social storytelling platform where people can write their life histories chapter by chapter, attach timelines, photos, and voice notes, publish privately or publicly, and optionally post anonymously for community advice.

## Architecture

- `apps/web`: Vite + React web client with a responsive, social-first UI.
- `apps/api`: Express API with MongoDB, JWT auth, rate limiting, validation, and secure defaults.
- `packages/shared`: Shared Zod schemas and TypeScript types used by both apps.

## Product scope in this scaffold

- Secure auth flow foundations.
- Story creation with chapters, timeline moments, visibility controls, and anonymous mode.
- Premium-ready content constraints.
- Read-count tracking and engagement-oriented feed design.
- Security baseline: input validation, CORS, Helmet, rate limiting, password hashing, JWT verification, and centralized error handling.

## Run locally

1. Install dependencies: `npm install`
2. Copy environment variables:
   - `apps/api/.env.example` to `apps/api/.env`
   - `apps/web/.env.example` to `apps/web/.env.local`
3. Start the API: `npm run dev:api`
4. Start the web app: `npm run dev:web`

## Notes

- The user-facing design is implemented in the web app as a polished landing and dashboard-style shell inspired by creator/social products.
- The API includes foundational routes and models, not every production feature endpoint yet.
- MongoDB should point to a replica set or managed cluster in production, with object storage used for images and voice uploads.

## Deploy to Vercel

Deploy the monorepo as two separate Vercel projects:

- Web project:
  - Root Directory: `apps/web`
  - Framework: `Vite`
  - Env: `VITE_API_URL=https://YOUR-API-PROJECT.vercel.app/api`
- API project:
  - Root Directory: `apps/api`
  - Framework: `Other`
  - Env:
    - `MONGODB_URI`
    - `JWT_SECRET`
    - `CLIENT_ORIGIN=https://YOUR-WEB-PROJECT.vercel.app`
    - `CLIENT_ORIGINS=https://YOUR-WEB-PROJECT.vercel.app`
    - `ALLOW_VERCEL_PREVIEWS=true`

The web app includes a Vercel SPA rewrite in `apps/web/vercel.json`, and the API includes a serverless rewrite in `apps/api/vercel.json`.

### CORS notes

- The API allows localhost for development.
- Production web origins should be set with `CLIENT_ORIGIN` and `CLIENT_ORIGINS`.
- If `ALLOW_VERCEL_PREVIEWS=true`, preview deployments from `*.vercel.app` are allowed, which prevents common Vercel preview CORS failures.

## Deploy API to Render

The repo includes a Render blueprint at [render.yaml](/Users/mac/OpenSource/Histora/render.yaml) for the backend.

Recommended setup:

- Import the repo into Render as a `Blueprint` or create a `Web Service` from the same repo.
- Keep the service at the repo root so Render can use the workspace `package.json` and `package-lock.json`.
- Build command:
  - `npm install && npm run build --workspace @histora/shared && npm run build --workspace @histora/api`
- Start command:
  - `npm run start --workspace @histora/api`
- Health check path:
  - `/health`

Required env vars on Render:

- `MONGODB_URI`
- `JWT_SECRET`
- `ASSEMBLYAI_API_KEY`
- `TRANSCRIPTION_PROVIDER=assemblyai`
- `CLIENT_ORIGIN=https://YOUR-WEB-URL`
- `CLIENT_ORIGINS=https://YOUR-WEB-URL`
- `ALLOW_VERCEL_PREVIEWS=false`
- `NODE_ENV=production`

Notes:

- Render injects `PORT`; the backend already reads it from env.
- The API should be deployed to Render as a normal long-running web service, not a serverless function.
- After deployment, point the frontend to the Render API URL with `VITE_API_URL=https://YOUR-RENDER-API.onrender.com/api`.
# Histora
