# DCRM Deployment Guide

## Quick Start (Self-Hosted)

### 1. Clone and Configure

```bash
git clone <repo-url> && cd DCRM2
cp .env.example .env
```

Edit `.env` and set:

- `BETTER_AUTH_SECRET` — `openssl rand -base64 48`
- `ENCRYPTION_KEY` — `openssl rand -hex 16`
- `POSTGRES_PASSWORD` — a strong password
- `APP_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN` — your public URL (e.g. `https://dcrm.example.com`)

Update `DATABASE_URL` to match your `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`.

### 2. Build and Run

```bash
docker compose up -d --build
```

The app starts on `http://localhost:3001` (or the port set by `APP_PORT`).

### 3. Run Database Migrations

On first deploy, push the schema:

```bash
docker compose exec app npx --workspace=@DCRM/db drizzle-kit push
```

Or use `pnpm db:push` from a local checkout with `DATABASE_URL` pointed at the database.

## Architecture

| Service | Image | Purpose |
|---------|-------|---------|
| `app` | Built from `Dockerfile` | TanStack Start web app (SSR + client) |
| `postgres` | `postgres:17-alpine` | Primary database |
| `redis` | `redis:7-alpine` | BullMQ job queue (hooks, email sync, background work) |

### Volumes

| Volume | Mount | Purpose |
|--------|-------|---------|
| `dcrm_postgres_data` | `/var/lib/postgresql/data` | Persistent database |
| `dcrm_redis_data` | `/data` | Redis AOF persistence |
| `dcrm_uploads` | `/app/uploads` | Local file attachments |

## Environment Variables

See `.env.example` for the full list with documentation.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Auth secret (≥32 chars) |
| `BETTER_AUTH_URL` | Public base URL for auth |
| `CORS_ORIGIN` | Allowed CORS origin |
| `REDIS_URL` | Redis connection for BullMQ |
| `ENCRYPTION_KEY` | AES-256-GCM master key (≥32 chars) |
| `APP_URL` | Public app URL |

### Optional Integrations

| Variable | Description |
|----------|-------------|
| `STORAGE_TYPE` | `local` (default) or `s3` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | S3-compatible storage config |
| `BILLING_ENABLED` | Set `true` to enable Stripe billing |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Stripe integration |
| `WEBHOOK_BASE_URL` | Override for incoming webhook URLs |

## Dokploy Deployment

Dokploy provides a UI layer on top of docker-compose with reverse proxy (Traefik/Caddy), SSL, and multi-app management.

### Setup Steps

1. **Create a Compose project** in Dokploy.
2. **Set the source** to your Git repository.
3. **Configure environment variables** in the Dokploy UI using the same keys as `.env.example`.
4. **Deploy** — Dokploy runs `docker compose up -d --build` automatically.

### Dokploy-Specific Notes

- **Domains**: Configure `APP_URL`, `BETTER_AUTH_URL`, and `CORS_ORIGIN` to match the Dokploy-assigned domain.
- **SSL**: Dokploy handles TLS termination. The app container only listens on HTTP (port 3001).
- **Database**: The compose file includes PostgreSQL. For external managed PostgreSQL, remove the `postgres` service and set `DATABASE_URL` accordingly.
- **Redis**: The compose file includes Redis. For external managed Redis, remove the `redis` service and set `REDIS_URL` accordingly.
- **Volumes**: Dokploy manages named volumes. Local file uploads are stored in the `dcrm_uploads` volume.
- **Migrations**: After the first deploy, run migrations via a one-off command or through the Dokploy terminal.

### Production Hardening

- Remove `ports` from `postgres` and `redis` services to prevent external access.
- Set a strong `POSTGRES_PASSWORD`.
- Use HTTPS for `APP_URL` / `BETTER_AUTH_URL` / `CORS_ORIGIN`.
- Configure `STORAGE_TYPE=s3` for scalable file storage.
- Enable `BILLING_ENABLED=true` only for the hosted service.

## Updating

```bash
git pull
docker compose up -d --build
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| App won't start | Verify all required env vars are set in `.env` |
| Database connection refused | Ensure `postgres` is healthy: `docker compose logs postgres` |
| Background jobs not running | Ensure `redis` is healthy: `docker compose logs redis` |
| Auth redirects broken | Verify `BETTER_AUTH_URL` and `CORS_ORIGIN` match the public URL |
| File uploads fail | Check `STORAGE_TYPE` config; for local, ensure the `dcrm_uploads` volume is writable |
