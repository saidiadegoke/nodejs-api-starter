# SmartStore API - Docker Deployment

This service can be deployed independently using Docker.

## Quick Start

1. **Set environment variables** (via `.env` file or system environment):
   ```bash
   # Required variables
   DB_HOST=your-postgres-host
   DB_PORT=5432
   DB_USER=smartstore
   DB_PASSWORD=your-secure-password
   DB_NAME=smartstore_db
   JWT_SECRET=your-strong-secret-key
   JWT_REFRESH_SECRET=your-strong-refresh-secret
   NEXT_PUBLIC_API_URL=https://api.your-domain.com
   CORS_ORIGIN=https://your-domain.com
   ```

2. **Build and start**:
   ```bash
   cd smartstore-api
   docker-compose up -d
   ```

3. **Run migrations**:
   ```bash
   docker-compose exec api npm run migrate
   ```

## Environment Variables

All environment variables must be set. See `../env.example` for a complete list.

## Building

```bash
# Build image
docker-compose build

# Build without cache
docker-compose build --no-cache
```

## Running

```bash
# Start service
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose stop

# Stop and remove
docker-compose down
```

## Health Check

The service includes a health check endpoint:
- URL: `http://localhost:4050/health`
- Check status: `docker-compose ps`

## Volumes

- `api_uploads`: Persistent storage for file uploads

## Ports

- **Internal Port**: `4050` (service listens on this port)
- **External Access**: Via Nginx at `api.smartstore.ng` (port 80/443)
- **Direct Access**: Optional - uncomment ports in docker-compose.yml if needed for debugging
- **Override**: Set `API_PORT` environment variable

