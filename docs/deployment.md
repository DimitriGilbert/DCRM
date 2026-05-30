# DCRM Deployment

DCRM is deployed with Docker Compose for both self-hosted installs and the Dokploy-hosted baseline. The stack runs the web app, PostgreSQL, and Redis. Redis is required for BullMQ-backed background work.

## Self-hosted Compose

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET`, and `ENCRYPTION_KEY` with long random values. Do not commit `.env`.
3. Set `APP_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, and `WEBHOOK_BASE_URL` to the public HTTPS origin when deploying behind a proxy.
4. Start the stack:

```bash
docker compose up -d --build
```

The app listens on `APP_PORT` on the host and port `3000` inside the container. PostgreSQL and Redis are only exposed to other Compose services by default.

## Optional integrations

- Local attachment storage is enabled by default with the `dcrm_attachments` volume.
- S3-compatible storage is enabled only when `STORAGE_BACKEND=s3_compatible` and all `S3_*` connection variables are set.
- Stripe billing is enabled only when `HOSTED_BILLING_ENABLED=true` and `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PRICE_ID` are set.

## Dokploy path

1. Create a Dokploy Compose application from this repository.
2. Use the root `docker-compose.yml`.
3. Add environment variables from `.env.example` in Dokploy's environment editor, replacing all placeholder secrets.
4. Point the Dokploy domain to the app service on container port `3000`.
5. Set `APP_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN`, and `WEBHOOK_BASE_URL` to the Dokploy HTTPS domain.
6. Deploy. Dokploy will build the app image and keep PostgreSQL, Redis, and attachment data in named Docker volumes.

Run database schema operations from an app container when needed, using the same environment as the deployed app.
