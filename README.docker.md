# Docker Deployment

This service can be deployed independently using Docker.

## Quick Start

1. **Set environment variables** in `.env` — every runtime value
   (including `PORT`) is sourced from this file via `env_file`. Copy
   `.env.example` and edit:
   ```bash
   APP_NAME=Your App
   NODE_ENV=production
   PORT=5269                                  # deploy port
   API_BASE_URL=https://api.your-domain.com
   FRONTEND_URL=https://your-domain.com
   CORS_ORIGIN=https://your-domain.com
   DB_HOST=your-postgres-host
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your-secure-password
   DB_NAME=your_app
   JWT_SECRET=your-strong-secret-key
   JWT_REFRESH_SECRET=your-strong-refresh-secret
   # …plus optional sections: AWS_S3_*, SMTP_*, RATE_LIMIT_*, LOG_*, OAuth, JUPEB_*
   ```
   Compose does **not** hard-code any secrets or URLs in
   `docker-compose.yml`; if a value is missing from `.env`, it's missing
   in the container.

2. **Build and start**:
   ```bash
   docker compose up -d --build
   ```

3. **Run migrations and seed**:
   ```bash
   docker compose exec api npm run migrate
   docker compose exec api npm run seed
   ```

4. **Default admin** (after a successful seed): `admin@example.com` / `Admin@12` — rotate in production. If login fails on an old volume, see **SETUP.md** (legacy `password` hash).

## Environment Variables

See `.env.example` for the complete list.

## Common Commands

```bash
docker compose build                   # build image
docker compose build --no-cache        # clean rebuild
docker compose up -d                   # start
docker compose logs -f                 # tail logs
docker compose stop                    # stop
docker compose down                    # stop and remove containers
docker compose exec api sh             # shell into the container
```

## Health Check

The container exposes a health check:

- URL: `http://localhost:${PORT}/health` (default `5269`)
- Status: `docker compose ps`

## Volumes

- `api_uploads` — persistent storage for file uploads (mounted at `/app/uploads`)

## Ports

- Default: `5269` (set via `PORT` in `.env`).
- `docker-compose.yml` binds `${PORT}:${PORT}` — same value inside and
  outside the container. Put a reverse proxy (Nginx / Traefik / Caddy)
  in front in production.
