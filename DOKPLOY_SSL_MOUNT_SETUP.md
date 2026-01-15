# Setting Up SSL Certificate Bind Mount in Dokploy

## Problem
Certificates uploaded via the dashboard are saved to `/app/ssl/` inside the container, but there's no bind mount to make them accessible on the host for Nginx.

## Solution
Add a bind mount in Dokploy to map `/opt/smartstore/ssl` (host) to `/app/ssl` (container).

## Steps

### 1. Prepare Host Directory
Run on the server:
```bash
sudo ./smartstore-api/setup-shared-ssl-directory.sh
```

This creates:
- `/opt/smartstore/ssl/certs/` - for certificates
- `/opt/smartstore/ssl/keys/` - for private keys
- `/etc/ssl/smartstore` - symlink to `/opt/smartstore/ssl` (for Nginx)

### 2. Add Volume Mount in Dokploy

#### Option A: Via Dokploy UI
1. Go to Dokploy dashboard
2. Navigate to your `smartstore-api` service
3. Go to **Volumes** or **Storage** section
4. Add a new volume:
   - **Type**: Bind Mount
   - **Host Path**: `/opt/smartstore/ssl`
   - **Container Path**: `/app/ssl`
   - **Read/Write**: Yes (RW)

#### Option B: Via Dokploy Configuration File
If Dokploy uses a configuration file (like `dokploy.yml` or similar), add:

```yaml
volumes:
  - type: bind
    source: /opt/smartstore/ssl
    target: /app/ssl
    read_only: false
```

### 3. Redeploy Service
After adding the volume mount:
1. Save the configuration in Dokploy
2. Redeploy the service (Dokploy should handle this automatically, or click "Redeploy")

### 4. Verify Mount
After redeployment, verify the mount is working:

```bash
# Check container mounts
docker inspect <container-name> | grep -A 10 Mounts

# Or use the test script
./smartstore-api/test-ssl-write.sh
```

You should see:
```
   /opt/smartstore/ssl -> /app/ssl (bind)
```

### 5. Test Certificate Upload
1. Upload a certificate via the dashboard
2. Check if file appears on host:
   ```bash
   ls -la /opt/smartstore/ssl/certs/
   ```
3. Check container logs:
   ```bash
   docker logs <container-name> | grep CertificateManager
   ```

## Expected Result

After setup:
- ✅ Certificates uploaded via UI → saved to `/app/ssl/certs/` in container
- ✅ Files appear at `/opt/smartstore/ssl/certs/` on host
- ✅ Nginx can access via `/etc/ssl/smartstore/certs/` (symlink)
- ✅ Path translation in `nginx.service.js` converts `/app/ssl/...` → `/etc/ssl/smartstore/...`

## Troubleshooting

### Files not appearing on host
- Check mount is configured: `docker inspect <container> | grep Mounts`
- Verify host directory exists: `ls -la /opt/smartstore/ssl`
- Check permissions: `sudo chown -R 1001:1001 /opt/smartstore/ssl`

### Permission errors
- Ensure container user (UID 1001) can write to `/opt/smartstore/ssl`
- Run: `sudo chown -R 1001:1001 /opt/smartstore/ssl`
- Or adjust Dokploy service user/group settings

### Dokploy doesn't support bind mounts
If Dokploy doesn't support bind mounts, alternatives:
1. Use a named volume and copy files manually
2. Use a shared network storage (NFS, etc.)
3. Use Dokploy's file management features to sync files

## Current Status
- Environment variables: ✅ Set correctly
- Host directory: ✅ Exists at `/opt/smartstore/ssl`
- Container can write: ✅ Works (but files don't persist to host)
- Bind mount: ❌ **NOT CONFIGURED** - needs to be added in Dokploy

