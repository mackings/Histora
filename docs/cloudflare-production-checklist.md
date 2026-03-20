# Histora Cloudflare Production Checklist

## Domains

- `app.your-domain.com` -> web deployment origin, proxied through Cloudflare
- `api.your-domain.com` -> API origin, proxied through Cloudflare
- Optional: `media.your-domain.com` -> R2 custom domain for public media

## DNS

- Create `CNAME` for `app` to the web host target.
- Create `CNAME` for `api` to the API host target.
- Enable Cloudflare proxy on both records.
- If using an R2 custom domain, bind `media` to the bucket.

## SSL/TLS

- Use `Full (strict)`.
- Enable `Always Use HTTPS`.
- Enable `Automatic HTTPS Rewrites`.

## Edge Rules

- Cache static web assets aggressively.
- Bypass cache for `/api/*`.
- Bypass cache for authenticated routes and websocket upgrades.
- Set security headers at origin and keep Cloudflare header overrides minimal.

## WAF And Rate Limits

- Apply WAF managed rules on both `app` and `api`.
- Add rate limits for:
  - `/api/auth/login`
  - `/api/auth/register`
  - `/api/auth/forgot-password`
  - `/api/auth/refresh`
  - `/api/transcriptions`
  - `/ws/events`
- Allow websocket upgrades on `/ws/events`.

## Zero Trust

- Restrict admin/staging deployments behind Cloudflare Access if used.
- If the API origin is private, use Tunnel or Access service tokens instead of exposing the raw origin.

## R2

- Bucket CORS must allow:
  - `PUT`, `GET`, `HEAD`
  - origins for your web domains
  - `Content-Type`, `Content-Length`
- Keep signed upload/read URLs enabled server-side for private media.

## Required Runtime Secrets

### API

- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `REDIS_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`
- `DATA_ENCRYPTION_KEY`
- `CLIENT_ORIGIN` or `CLIENT_ORIGINS`

### Web

- `VITE_API_URL=https://api.your-domain.com/api`

## Validation

1. Verify `GET /health` through `https://api.your-domain.com/health`.
2. Verify auth cookie refresh works cross-origin with `credentials: include`.
3. Verify websocket connection through Cloudflare on `/ws/events`.
4. Verify signed R2 upload then signed private read flow.
5. Verify WAF/rate-limit behavior on auth endpoints.
