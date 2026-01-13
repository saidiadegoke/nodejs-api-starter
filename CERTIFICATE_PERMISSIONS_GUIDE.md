# Certificate Permissions Management Guide

This guide explains how to handle file permissions for SSL certificates and Nginx configuration management in different deployment scenarios.

## Problem

The SmartStore API needs to:
- Write certificate files to `/etc/ssl/smartstore/certs/` and `/etc/ssl/smartstore/keys/`
- Write Nginx configuration files to `/etc/nginx/sites-enabled/custom-domains/`
- Reload Nginx configuration

These operations typically require root or sudo access.

## Solutions by Deployment Type

### Option 1: Docker Deployment (Recommended)

#### Using Docker Volumes with Proper Permissions

**1. Create directories on host with proper permissions:**

```bash
# Create directories
sudo mkdir -p /etc/ssl/smartstore/{certs,keys}
sudo mkdir -p /etc/nginx/sites-enabled/custom-domains

# Set ownership to a group that Docker can use
sudo chown -R root:ssl-cert /etc/ssl/smartstore
sudo chmod -R 755 /etc/ssl/smartstore
sudo chmod -R 750 /etc/ssl/smartstore/keys  # Private keys need restricted access

# For Nginx configs
sudo chown -R root:nginx /etc/nginx/sites-enabled/custom-domains
sudo chmod -R 775 /etc/nginx/sites-enabled/custom-domains
```

**2. Update `docker-compose.yml` to mount volumes:**

```yaml
services:
  api:
    # ... other config ...
    volumes:
      - /etc/ssl/smartstore:/etc/ssl/smartstore:rw
      - /etc/nginx/sites-enabled/custom-domains:/etc/nginx/sites-enabled/custom-domains:rw
    # Run as a user that can write to these directories
    user: "1000:ssl-cert"  # Adjust UID/GID as needed
```

**3. Or run container with specific user:**

```yaml
services:
  api:
    # ... other config ...
    user: "0:0"  # Run as root (less secure but simpler)
    volumes:
      - /etc/ssl/smartstore:/etc/ssl/smartstore:rw
      - /etc/nginx/sites-enabled/custom-domains:/etc/nginx/sites-enabled/custom-domains:rw
```

### Option 2: Systemd Service with Capabilities

**1. Create a dedicated user and group:**

```bash
# Create smartstore user
sudo useradd -r -s /bin/false smartstore
sudo groupadd ssl-cert
sudo usermod -aG ssl-cert smartstore
sudo usermod -aG nginx smartstore
```

**2. Set directory permissions:**

```bash
# SSL certificates
sudo mkdir -p /etc/ssl/smartstore/{certs,keys}
sudo chown -R root:ssl-cert /etc/ssl/smartstore
sudo chmod -R 755 /etc/ssl/smartstore
sudo chmod -R 750 /etc/ssl/smartstore/keys
sudo chmod g+s /etc/ssl/smartstore/certs  # Set group sticky bit
sudo chmod g+s /etc/ssl/smartstore/keys

# Nginx configs
sudo chown -R root:nginx /etc/nginx/sites-enabled/custom-domains
sudo chmod -R 775 /etc/nginx/sites-enabled/custom-domains
sudo chmod g+s /etc/nginx/sites-enabled/custom-domains
```

**3. Create systemd service file:**

```ini
# /etc/systemd/system/smartstore-api.service
[Unit]
Description=SmartStore API
After=network.target postgresql.service

[Service]
Type=simple
User=smartstore
Group=ssl-cert
WorkingDirectory=/opt/smartstore/api
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

# Capabilities for Nginx management
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

### Option 3: Sudo with NOPASSWD (Quick but Less Secure)

**1. Configure sudoers:**

```bash
sudo visudo
```

Add these lines:

```
# Allow smartstore user to manage SSL certificates and Nginx
smartstore ALL=(ALL) NOPASSWD: /bin/mkdir -p /etc/ssl/smartstore/*
smartstore ALL=(ALL) NOPASSWD: /bin/chmod * /etc/ssl/smartstore/*
smartstore ALL=(ALL) NOPASSWD: /bin/chown * /etc/ssl/smartstore/*
smartstore ALL=(ALL) NOPASSWD: /usr/bin/nginx -t
smartstore ALL=(ALL) NOPASSWD: /usr/bin/nginx -s reload
smartstore ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
```

**2. Update certificate service to use sudo:**

```javascript
// In certificateManager.service.js
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// When creating directories
await execAsync(`sudo mkdir -p ${path.dirname(certPath)}`);
await execAsync(`sudo chmod 755 ${path.dirname(certPath)}`);
```

### Option 4: Writable Directory + Copy Script (Most Secure)

**1. Use writable directory for app:**

```bash
# Create writable directory
mkdir -p /opt/smartstore/ssl/{certs,keys}
chown -R smartstore:smartstore /opt/smartstore/ssl
```

**2. Set environment variables:**

```env
CLOUDFLARE_ORIGIN_CERT_PATH=/opt/smartstore/ssl/certs/cloudflare-origin.crt
CLOUDFLARE_ORIGIN_KEY_PATH=/opt/smartstore/ssl/keys/cloudflare-origin.key
```

**3. Create a deployment script that copies to system location:**

```bash
#!/bin/bash
# /usr/local/bin/deploy-certificates.sh

# Copy certificates to system location
sudo cp /opt/smartstore/ssl/certs/*.crt /etc/ssl/smartstore/certs/
sudo cp /opt/smartstore/ssl/keys/*.key /etc/ssl/smartstore/keys/
sudo chmod 644 /etc/ssl/smartstore/certs/*.crt
sudo chmod 600 /etc/ssl/smartstore/keys/*.key
sudo chown root:ssl-cert /etc/ssl/smartstore/certs/*.crt
sudo chown root:ssl-cert /etc/ssl/smartstore/keys/*.key

# Reload Nginx
sudo nginx -t && sudo nginx -s reload
```

**4. Run script via cron or webhook:**

```bash
# Allow smartstore user to run deployment script
sudo visudo
# Add:
smartstore ALL=(ALL) NOPASSWD: /usr/local/bin/deploy-certificates.sh
```

### Option 5: Use Application Directory (Simplest for Development)

**1. Update environment variables to use app directory:**

```env
# Use relative paths in application directory
CLOUDFLARE_ORIGIN_CERT_PATH=./ssl/certs/cloudflare-origin.crt
CLOUDFLARE_ORIGIN_KEY_PATH=./ssl/keys/cloudflare-origin.key
```

**2. Ensure app directory is writable:**

```bash
mkdir -p ssl/{certs,keys}
chmod -R 755 ssl
chmod -R 700 ssl/keys  # Private keys
```

**3. For production, copy certificates to Nginx location manually or via deployment script.**

## Recommended Approach: Hybrid Solution

Combine writable app directory with deployment script:

### 1. Application writes to writable location:

```env
# In .env
CLOUDFLARE_ORIGIN_CERT_PATH=./ssl/certs/cloudflare-origin.crt
CLOUDFLARE_ORIGIN_KEY_PATH=./ssl/keys/cloudflare-origin.key
```

### 2. Create deployment service/script:

```javascript
// In certificateManager.service.js
static async deployCertificateToSystem(certPath, keyPath) {
  const systemCertPath = '/etc/ssl/smartstore/certs/cloudflare-origin.crt';
  const systemKeyPath = '/etc/ssl/smartstore/keys/cloudflare-origin.key';
  
  try {
    // Try to copy to system location (requires permissions)
    await execAsync(`sudo cp ${certPath} ${systemCertPath}`);
    await execAsync(`sudo cp ${keyPath} ${systemKeyPath}`);
    await execAsync(`sudo chmod 644 ${systemCertPath}`);
    await execAsync(`sudo chmod 600 ${systemKeyPath}`);
    logger.info('[CertificateManager] Certificate deployed to system location');
  } catch (error) {
    logger.warn('[CertificateManager] Could not deploy to system location, using app directory');
    // Continue with app directory paths
  }
}
```

### 3. Update Nginx service to check both locations:

```javascript
// In nginx.service.js
getCertificatePath(domain) {
  // Try system location first
  const systemPath = `/etc/ssl/smartstore/certs/${domain}.crt`;
  if (fs.existsSync(systemPath)) {
    return systemPath;
  }
  
  // Fallback to app directory
  return path.join(process.cwd(), 'ssl', 'certs', `${domain}.crt`);
}
```

## Docker-Specific Solution

### Using Docker with Proper Permissions

**1. Create directories on host:**

```bash
sudo mkdir -p /opt/smartstore/{ssl/certs,ssl/keys,nginx-configs}
sudo chown -R 1000:1000 /opt/smartstore  # Use Docker user UID/GID
```

**2. Update docker-compose.yml:**

```yaml
services:
  api:
    build: .
    volumes:
      - /opt/smartstore/ssl:/app/ssl:rw
      - /opt/smartstore/nginx-configs:/app/nginx-configs:rw
    environment:
      - CLOUDFLARE_ORIGIN_CERT_PATH=/app/ssl/certs/cloudflare-origin.crt
      - CLOUDFLARE_ORIGIN_KEY_PATH=/app/ssl/keys/cloudflare-origin.key
      - NGINX_SITES_ENABLED=/app/nginx-configs
    user: "1000:1000"  # Match host directory ownership
```

**3. For Nginx (if in separate container):**

```yaml
  nginx:
    image: nginx:alpine
    volumes:
      - /opt/smartstore/ssl:/etc/ssl/smartstore:ro  # Read-only for Nginx
      - /opt/smartstore/nginx-configs:/etc/nginx/sites-enabled/custom-domains:ro
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    ports:
      - "80:80"
      - "443:443"
```

## Security Best Practices

1. **Private keys should be 600 permissions** (read/write for owner only)
2. **Certificates can be 644** (readable by all, writable by owner)
3. **Use dedicated user/group** instead of root when possible
4. **Limit sudo access** to specific commands only
5. **Use Docker volumes** with proper ownership
6. **Audit certificate access** regularly

## Testing Permissions

```bash
# Test if application can write
sudo -u smartstore touch /etc/ssl/smartstore/certs/test.crt
sudo -u smartstore touch /etc/ssl/smartstore/keys/test.key

# Test Nginx reload
sudo -u smartstore sudo nginx -t
sudo -u smartstore sudo nginx -s reload
```

## Troubleshooting

### Permission Denied Errors

1. **Check directory ownership:**
   ```bash
   ls -la /etc/ssl/smartstore
   ```

2. **Check group membership:**
   ```bash
   groups smartstore
   ```

3. **Test write access:**
   ```bash
   sudo -u smartstore touch /etc/ssl/smartstore/certs/test
   ```

### Nginx Reload Fails

1. **Check Nginx config syntax:**
   ```bash
   sudo nginx -t
   ```

2. **Check Nginx user permissions:**
   ```bash
   sudo -u nginx nginx -t
   ```

3. **Verify config file ownership:**
   ```bash
   ls -la /etc/nginx/sites-enabled/custom-domains/
   ```

## Quick Setup Script

```bash
#!/bin/bash
# setup-certificate-permissions.sh

# Create directories
sudo mkdir -p /etc/ssl/smartstore/{certs,keys}
sudo mkdir -p /etc/nginx/sites-enabled/custom-domains

# Create group
sudo groupadd -f ssl-cert

# Create user (if doesn't exist)
sudo useradd -r -s /bin/false -g ssl-cert smartstore || true

# Set permissions
sudo chown -R root:ssl-cert /etc/ssl/smartstore
sudo chmod -R 755 /etc/ssl/smartstore
sudo chmod -R 750 /etc/ssl/smartstore/keys
sudo chmod g+s /etc/ssl/smartstore/certs
sudo chmod g+s /etc/ssl/smartstore/keys

# Nginx permissions
sudo chown -R root:nginx /etc/nginx/sites-enabled/custom-domains
sudo chmod -R 775 /etc/nginx/sites-enabled/custom-domains
sudo chmod g+s /etc/nginx/sites-enabled/custom-domains

# Add smartstore to nginx group
sudo usermod -aG nginx smartstore

echo "Permissions configured. Restart your application."
```

Run with: `sudo bash setup-certificate-permissions.sh`

