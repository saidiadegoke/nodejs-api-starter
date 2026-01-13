#!/bin/bash
# Setup Certificate Permissions Script
# This script configures file permissions for SSL certificates and Nginx configuration

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Setting up certificate and Nginx permissions...${NC}"

# Create directories
echo -e "${YELLOW}Creating directories...${NC}"
sudo mkdir -p /etc/ssl/smartstore/{certs,keys}
sudo mkdir -p /etc/nginx/sites-enabled/custom-domains

# Create groups if they don't exist
if ! getent group ssl-cert > /dev/null 2>&1; then
    echo -e "${YELLOW}Creating ssl-cert group...${NC}"
    sudo groupadd ssl-cert
fi

# Check if nginx group exists (nginx might not be installed)
if ! getent group nginx > /dev/null 2>&1; then
    echo -e "${YELLOW}Nginx group not found. Creating nginx group...${NC}"
    sudo groupadd nginx || {
        echo -e "${YELLOW}Could not create nginx group. Using www-data group instead.${NC}"
        NGINX_GROUP="www-data"
    }
else
    NGINX_GROUP="nginx"
fi

# Get the current user (or use SMARTSTORE_USER env var)
SMARTSTORE_USER=${SMARTSTORE_USER:-$USER}
if [ "$SMARTSTORE_USER" = "root" ]; then
    echo -e "${RED}Warning: Running as root. Consider creating a dedicated user.${NC}"
    SMARTSTORE_USER="smartstore"
fi

# Create smartstore user if it doesn't exist
if ! id "$SMARTSTORE_USER" &>/dev/null; then
    echo -e "${YELLOW}Creating smartstore user...${NC}"
    sudo useradd -r -s /bin/false -g ssl-cert "$SMARTSTORE_USER" || true
fi

# Set SSL certificate permissions
echo -e "${YELLOW}Setting SSL certificate permissions...${NC}"
sudo chown -R root:ssl-cert /etc/ssl/smartstore
sudo chmod -R 755 /etc/ssl/smartstore
sudo chmod -R 750 /etc/ssl/smartstore/keys
sudo chmod g+s /etc/ssl/smartstore/certs
sudo chmod g+s /etc/ssl/smartstore/keys

# Set Nginx config permissions
echo -e "${YELLOW}Setting Nginx configuration permissions...${NC}"
if [ -d "/etc/nginx" ]; then
    sudo chown -R root:${NGINX_GROUP} /etc/nginx/sites-enabled/custom-domains
    sudo chmod -R 775 /etc/nginx/sites-enabled/custom-domains
    sudo chmod g+s /etc/nginx/sites-enabled/custom-domains
else
    echo -e "${YELLOW}Warning: /etc/nginx directory not found. Nginx may not be installed.${NC}"
fi

# Add smartstore user to nginx/www-data group
if getent group ${NGINX_GROUP} > /dev/null 2>&1; then
    echo -e "${YELLOW}Adding $SMARTSTORE_USER to ${NGINX_GROUP} group...${NC}"
    sudo usermod -aG ${NGINX_GROUP} "$SMARTSTORE_USER" || true
fi

# Add smartstore user to ssl-cert group (if not already)
sudo usermod -aG ssl-cert "$SMARTSTORE_USER" || true

# Configure sudoers for Nginx commands (optional)
echo -e "${YELLOW}Configuring sudoers for Nginx management...${NC}"
SUDOERS_FILE="/etc/sudoers.d/smartstore-nginx"
sudo tee "$SUDOERS_FILE" > /dev/null <<EOF
# SmartStore Nginx Management
# Allow $SMARTSTORE_USER to manage Nginx without password
$SMARTSTORE_USER ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
$SMARTSTORE_USER ALL=(ALL) NOPASSWD: /usr/sbin/nginx -s reload
$SMARTSTORE_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload nginx
$SMARTSTORE_USER ALL=(ALL) NOPASSWD: /bin/systemctl status nginx
EOF

sudo chmod 0440 "$SUDOERS_FILE"

echo -e "${GREEN}✓ Permissions configured successfully${NC}"
echo ""
echo -e "${GREEN}Summary:${NC}"
echo "  - SSL certificates: /etc/ssl/smartstore (group: ssl-cert)"
if [ -d "/etc/nginx" ]; then
    echo "  - Nginx configs: /etc/nginx/sites-enabled/custom-domains (group: ${NGINX_GROUP})"
fi
echo "  - User: $SMARTSTORE_USER"
echo "  - Groups: ssl-cert${NGINX_GROUP:+, ${NGINX_GROUP}}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Set environment variable: USE_SUDO_FOR_NGINX=true"
echo "  2. Restart your SmartStore API service"
echo "  3. Test certificate upload in the dashboard"
echo ""

