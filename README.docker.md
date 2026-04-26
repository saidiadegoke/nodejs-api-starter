# Docker Deployment

This service can be deployed independently using Docker.

## Quick Start

1. **Set environment variables** (via `.env` file):
   ```bash
   DB_HOST=your-postgres-host
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your-secure-password
   DB_NAME=your_app
   JWT_SECRET=your-strong-secret-key
   JWT_REFRESH_SECRET=your-strong-refresh-secret
   API_BASE_URL=https://api.your-domain.com
   FRONTEND_URL=https://your-domain.com
   CORS_ORIGIN=https://your-domain.com
   ```

2. **Build and start**:
   ```bash
   docker compose up -d --build
   ```

3. **Run migrations and seed**:
   ```bash
   docker compose exec api npm run migrate
   docker compose exec api npm run seed
   ```

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

- URL: `http://localhost:5000/health`
- Status: `docker compose ps`

## Volumes

- `api_uploads` — persistent storage for file uploads (mounted at `/app/uploads`)

## Ports

- Internal: `5000` (override with `PORT`)
- The `docker-compose.yml` binds `${PORT:-5000}:${PORT:-5000}` — expose behind your reverse proxy (Nginx / Traefik / Caddy) in production.
