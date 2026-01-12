# Nginx Production Setup Guide

This guide explains how to set up Nginx for SmartStore production deployment with subdomain and custom domain support.

## Prerequisites

- Ubuntu/Debian server (or similar Linux distribution)
- Nginx installed (`sudo apt-get install nginx`)
- Root or sudo access
- SSL certificates (wildcard for subdomains, individual for custom domains)

## Installation

### 1. Install Nginx

```bash
sudo apt-get update
sudo apt-get install nginx
```

### 2. Create Directory Structure

```bash
# Create directories for custom domain configs
sudo mkdir -p /etc/nginx/sites-enabled/custom-domains
sudo chown -R $USER:$USER /etc/nginx/sites-enabled/custom-domains

# Create SSL certificate directory
sudo mkdir -p /etc/ssl/smartstore
sudo chmod 700 /etc/ssl/smartstore
```

### 3. Copy Base Configuration

```bash
# Copy the example config
sudo cp nginx/nginx.conf.example /etc/nginx/nginx.conf

# Or merge with existing config (recommended)
# Edit /etc/nginx/nginx.conf and add the SmartStore configurations
```

### 4. Update Configuration

Edit `/etc/nginx/nginx.conf` and update:

- **Base domain**: Replace `smartstore.org` with your actual domain
- **Upstream servers**: Update ports if different:
  - `smartstore_app`: Default `localhost:3002`
  - `smartstore_api`: Default `localhost:4050`
  - `smartstore_web`: Default `localhost:3001`

## SSL Certificate Setup

### Option 1: Wildcard Certificate (Recommended for Subdomains)

#### Using Let's Encrypt with Certbot

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate wildcard certificate (DNS challenge required)
sudo certbot certonly --manual --preferred-challenges dns \
  -d "*.smartstore.org" -d "smartstore.org"

# Follow prompts to add DNS TXT record
# Certbot will provide instructions

# Certificates will be saved to:
# /etc/letsencrypt/live/smartstore.org/fullchain.pem
# /etc/letsencrypt/live/smartstore.org/privkey.pem

# Create symlinks for easier management
sudo ln -s /etc/letsencrypt/live/smartstore.org/fullchain.pem /etc/ssl/smartstore/wildcard.crt
sudo ln -s /etc/letsencrypt/live/smartstore.org/privkey.pem /etc/ssl/smartstore/wildcard.key
```

#### Using Cloudflare Origin Certificate

1. Go to Cloudflare Dashboard → SSL/TLS → Origin Server
2. Create Certificate
3. Download certificate and private key
4. Save to `/etc/ssl/smartstore/`:
   ```bash
   sudo nano /etc/ssl/smartstore/wildcard.crt  # Paste certificate
   sudo nano /etc/ssl/smartstore/wildcard.key  # Paste private key
   sudo chmod 600 /etc/ssl/smartstore/wildcard.key
   ```

### Option 2: Individual Certificates (For Custom Domains)

Custom domain certificates are automatically managed by:
- **Cloudflare**: Automatic SSL for proxied domains
- **Let's Encrypt**: Managed by `letsencrypt.service.js` via certbot

Certificates are stored in:
- Let's Encrypt: `/etc/letsencrypt/live/{domain}/`
- Cloudflare: Not stored locally (handled by Cloudflare)

## Configuration

### 1. Base Domain Configuration

For the main dashboard/admin site (`smartstore.org`):

```nginx
server {
    listen 443 ssl http2;
    server_name smartstore.org www.smartstore.org;
    
    ssl_certificate /etc/ssl/smartstore/base-domain.crt;
    ssl_certificate_key /etc/ssl/smartstore/base-domain.key;
    
    location / {
        proxy_pass http://smartstore_web;  # Dashboard
    }
}
```

### 2. Wildcard Subdomain Configuration

For user sites (`*.smartstore.org`):

```nginx
server {
    listen 443 ssl http2;
    server_name *.smartstore.org;
    
    ssl_certificate /etc/ssl/smartstore/wildcard.crt;
    ssl_certificate_key /etc/ssl/smartstore/wildcard.key;
    
    location / {
        proxy_pass http://smartstore_app;  # Site rendering app
    }
}
```

### 3. Custom Domain Configuration

Custom domains are automatically configured by `nginx.service.js`:

- Configs generated: `/etc/nginx/sites-enabled/custom-domains/{domain}.conf`
- Automatically included via: `include /etc/nginx/sites-enabled/custom-domains/*.conf;`
- SSL certificates managed by SSL service (Cloudflare or Let's Encrypt)

## Testing Configuration

### 1. Test Nginx Configuration

```bash
sudo nginx -t
```

Should output:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 2. Reload Nginx

```bash
sudo systemctl reload nginx
# Or
sudo nginx -s reload
```

### 3. Check Nginx Status

```bash
sudo systemctl status nginx
```

## Environment Variables

Set these in your application `.env`:

```bash
# Nginx Management
ENABLE_NGINX_MANAGEMENT=true
NGINX_SITES_ENABLED=/etc/nginx/sites-enabled/custom-domains
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf

# SSL Paths
SSL_CERT_PATH=/etc/ssl/smartstore
SSL_KEY_PATH=/etc/ssl/smartstore

# Application Ports
APP_PORT=3002
APP_HOST=localhost
```

## Permissions

### Nginx Service User

The `nginx.service.js` needs to:
- Write config files to `/etc/nginx/sites-enabled/custom-domains/`
- Reload Nginx

**Option 1: Run as root** (not recommended for production)
```bash
# Set in .env
ENABLE_NGINX_MANAGEMENT=true
# Application must run with sudo or have sudo access
```

**Option 2: Use sudo with NOPASSWD** (recommended)
```bash
# Add to /etc/sudoers (use visudo)
smartstore ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload

# Update nginx.service.js to use sudo
```

**Option 3: Nginx user in nginx group** (best for production)
```bash
# Add application user to nginx group
sudo usermod -aG nginx smartstore

# Set directory permissions
sudo chown -R nginx:nginx /etc/nginx/sites-enabled/custom-domains
sudo chmod -R 775 /etc/nginx/sites-enabled/custom-domains
```

## Certificate Renewal

### Let's Encrypt Auto-Renewal

```bash
# Test renewal
sudo certbot renew --dry-run

# Set up automatic renewal (cron job)
sudo crontab -e
# Add:
0 0 * * * certbot renew --quiet --deploy-hook "nginx -s reload"
```

### Cloudflare Certificates

- Cloudflare Origin Certificates: Renew manually in dashboard (valid for up to 15 years)
- Cloudflare Universal SSL: Automatically renewed by Cloudflare

## Troubleshooting

### Nginx Won't Reload

```bash
# Check syntax
sudo nginx -t

# Check error log
sudo tail -f /var/log/nginx/error.log

# Check if port is in use
sudo netstat -tulpn | grep :443
```

### SSL Certificate Issues

```bash
# Check certificate validity
openssl x509 -in /etc/ssl/smartstore/wildcard.crt -text -noout

# Check certificate expiration
openssl x509 -in /etc/ssl/smartstore/wildcard.crt -noout -enddate

# Test SSL connection
openssl s_client -connect smartstore.org:443 -servername smartstore.org
```

### Custom Domain Not Working

1. Check if config file exists:
   ```bash
   ls -la /etc/nginx/sites-enabled/custom-domains/
   ```

2. Check if included in main config:
   ```bash
   grep -r "custom-domains" /etc/nginx/nginx.conf
   ```

3. Check Nginx error log:
   ```bash
   sudo tail -f /var/log/nginx/error.log
   ```

4. Verify DNS points to server:
   ```bash
   dig example.com
   ```

## Security Best Practices

1. **Keep Nginx Updated**
   ```bash
   sudo apt-get update && sudo apt-get upgrade nginx
   ```

2. **Use Strong SSL Ciphers**
   - Already configured in example config
   - TLS 1.2+ only

3. **Enable Rate Limiting**
   - Already configured for API endpoints
   - Adjust limits as needed

4. **Regular Certificate Monitoring**
   - Set up alerts for certificate expiration
   - Monitor SSL certificate status

5. **Firewall Configuration**
   ```bash
   # Allow HTTP and HTTPS
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

## Production Checklist

- [ ] Nginx installed and configured
- [ ] Wildcard SSL certificate obtained and installed
- [ ] Base domain SSL certificate obtained and installed
- [ ] Directory permissions set correctly
- [ ] Nginx config tested (`nginx -t`)
- [ ] Nginx reloaded successfully
- [ ] Subdomain routing tested (`test.smartstore.org`)
- [ ] Custom domain routing tested (when domain added)
- [ ] SSL certificates valid and not expiring soon
- [ ] Auto-renewal configured (for Let's Encrypt)
- [ ] Firewall rules configured
- [ ] Monitoring/alerting set up for certificate expiration
- [ ] Backup of SSL certificates

## Next Steps

After Nginx is configured:
1. Test subdomain routing
2. Add a custom domain and verify SSL provisioning
3. Monitor certificate expiration
4. Set up automated backups of certificates

