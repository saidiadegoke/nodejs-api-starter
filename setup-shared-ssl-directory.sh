#!/bin/bash
# Setup shared SSL directory for Docker and Nginx access
# Handles:
# - Base Origin Certificate (smartstore.ng, *.smartstore.ng)
# - Multi-domain Cloudflare Origin Certificates (custom domains, up to 50 per cert)
# - Let's Encrypt certificates (managed by certbot, stored separately)

set -e

SHARED_SSL_DIR="/opt/smartstore/ssl"
CERT_DIR="${SHARED_SSL_DIR}/certs"
KEY_DIR="${SHARED_SSL_DIR}/keys"

# Let's Encrypt uses standard certbot location (separate from Cloudflare certs)
LETSENCRYPT_DIR="/etc/letsencrypt/live"

echo "=== Setting Up Shared SSL Directory ==="
echo ""
echo "This setup handles:"
echo "  1. Base Origin Certificate (smartstore.ng, *.smartstore.ng)"
echo "  2. Multi-domain Cloudflare Origin Certificates (custom domains)"
echo "  3. Let's Encrypt certificates (managed by certbot/Nginx)"
echo ""

# 1. Create directories for Cloudflare certificates
echo "1. Creating shared SSL directories for Cloudflare certificates..."
sudo mkdir -p "$CERT_DIR"
sudo mkdir -p "$KEY_DIR"
echo "   ✓ Directories created:"
echo "     - $CERT_DIR (for Cloudflare Origin Certificates)"
echo "     - $KEY_DIR (for Cloudflare Private Keys)"
echo ""

# 2. Set ownership (Docker container runs as UID 1001)
echo "2. Setting ownership..."
# Get the Docker user UID/GID (usually 1001 for node:alpine)
DOCKER_UID=1001
DOCKER_GID=1001

# Check if user/group exists
if id -u "$DOCKER_UID" >/dev/null 2>&1; then
    DOCKER_USER=$(id -nu "$DOCKER_UID")
    sudo chown -R "$DOCKER_USER:$DOCKER_USER" "$SHARED_SSL_DIR"
    echo "   ✓ Owned by user: $DOCKER_USER (UID: $DOCKER_UID)"
else
    # Create a group for smartstore if it doesn't exist
    if ! getent group smartstore >/dev/null 2>&1; then
        sudo groupadd -g "$DOCKER_GID" smartstore 2>/dev/null || true
    fi
    sudo chown -R "$DOCKER_UID:$DOCKER_GID" "$SHARED_SSL_DIR"
    echo "   ✓ Owned by UID: $DOCKER_UID, GID: $DOCKER_GID"
fi
echo ""

# 3. Set permissions
echo "3. Setting permissions..."
sudo chmod 755 "$SHARED_SSL_DIR"
sudo chmod 755 "$CERT_DIR"
sudo chmod 700 "$KEY_DIR"  # Private keys need stricter permissions
echo "   ✓ Permissions set"
echo ""

# 4. Create symlink for Nginx (optional, if Nginx expects /etc/ssl/smartstore)
echo "4. Creating symlink for Nginx compatibility..."
if [ ! -d "/etc/ssl/smartstore" ]; then
    sudo mkdir -p /etc/ssl
    sudo ln -sf "$SHARED_SSL_DIR" /etc/ssl/smartstore
    echo "   ✓ Symlink created: /etc/ssl/smartstore -> $SHARED_SSL_DIR"
else
    echo "   ⚠ /etc/ssl/smartstore already exists (not a symlink)"
    echo "   Consider removing it and creating symlink, or update Nginx config to use $SHARED_SSL_DIR"
fi
echo ""

# 5. Ensure Let's Encrypt directory exists (for certbot)
echo "5. Checking Let's Encrypt directory..."
if [ ! -d "$LETSENCRYPT_DIR" ]; then
    sudo mkdir -p "$LETSENCRYPT_DIR"
    echo "   ✓ Created: $LETSENCRYPT_DIR"
    echo "   Note: Certbot will create subdirectories per domain automatically"
else
    echo "   ✓ Already exists: $LETSENCRYPT_DIR"
fi
echo ""

# 6. Verify
echo "6. Verifying setup..."
if [ -d "$CERT_DIR" ] && [ -d "$KEY_DIR" ]; then
    echo "   ✓ Directories exist and are accessible"
    echo ""
    echo "   Directory structure:"
    echo "   Cloudflare Certificates:"
    ls -ld "$SHARED_SSL_DIR" "$CERT_DIR" "$KEY_DIR" 2>/dev/null | sed 's/^/     /'
    echo ""
    echo "   Let's Encrypt Certificates:"
    ls -ld "$LETSENCRYPT_DIR" 2>/dev/null | sed 's/^/     /' || echo "     (Will be created by certbot)"
else
    echo "   ✗ Setup failed"
    exit 1
fi
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Certificate storage structure:"
echo ""
echo "1. Cloudflare Origin Certificates (shared between Docker and Nginx):"
echo "   - Base Origin Cert: $CERT_DIR/cloudflare-origin.crt"
echo "   - Multi-domain Certs: $CERT_DIR/cert-{timestamp}.crt"
echo "   - Private Keys: $KEY_DIR/*.key"
echo "   - Docker mount: /app/ssl -> $SHARED_SSL_DIR"
echo "   - Nginx access: /etc/ssl/smartstore (symlink) or $SHARED_SSL_DIR"
echo ""
echo "2. Let's Encrypt Certificates (managed by certbot/Nginx):"
echo "   - Location: $LETSENCRYPT_DIR/{domain}/"
echo "   - Files: fullchain.pem, privkey.pem"
echo "   - Managed by: certbot (Nginx plugin)"
echo ""
echo "Next steps:"
echo ""
echo "For Cloudflare Certificates:"
echo "1. Update docker-compose.yml to use bind mount: /opt/smartstore/ssl:/app/ssl"
echo "2. Set environment variables in .env:"
echo "   CLOUDFLARE_ORIGIN_CERT_PATH=/app/ssl/certs/cloudflare-origin.crt"
echo "   CLOUDFLARE_ORIGIN_KEY_PATH=/app/ssl/keys/cloudflare-origin.key"
echo "3. Restart Docker container"
echo "4. Upload certificates via dashboard:"
echo "   - Base Origin Cert: Dashboard → Certificates → Base Origin Certificate"
echo "   - Multi-domain Certs: Dashboard → Certificates → Create Certificate"
echo "5. Nginx configs will read from /etc/ssl/smartstore (symlink)"
echo ""
echo "For Let's Encrypt Certificates:"
echo "1. Certbot manages certificates automatically via Nginx"
echo "2. Certificates stored in: $LETSENCRYPT_DIR/{domain}/"
echo "3. Nginx configs reference: $LETSENCRYPT_DIR/{domain}/fullchain.pem"
echo "4. Set CERTBOT_CERT_DIR=$LETSENCRYPT_DIR in .env"
echo ""

