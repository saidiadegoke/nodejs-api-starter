# SSL Certificate Integration Guide

This guide explains the SSL certificate management system with support for Cloudflare and Let's Encrypt.

## Overview

The SSL system provides automatic SSL certificate provisioning for custom domains with support for:
- **Cloudflare Origin Certificates** (Recommended) - Unlimited, scalable SSL certificates
- **Cloudflare Universal SSL** - Automatic per-domain SSL (fallback)
- **Let's Encrypt** - Free SSL certificates via Certbot (fallback only, rate-limited)
- **Nginx Configuration** - Automatic Nginx config generation and reload

## Priority Order

1. **Cloudflare Origin Certificate** (if configured) - Unlimited domains, one certificate
2. **Cloudflare Universal SSL** (if Origin Certificate not available) - Automatic per-domain
3. **Let's Encrypt** (fallback only) - Rate-limited, not scalable for production

## Architecture

### Services

1. **SSLService** (`ssl.service.js`)
   - Main orchestrator for SSL provisioning
   - Automatically selects provider based on configuration
   - Handles SSL status checking and renewal

2. **CloudflareService** (`cloudflare.service.js`)
   - Cloudflare API integration
   - Zone management
   - SSL/TLS settings management
   - Automatic SSL for proxied domains

3. **LetsEncryptService** (`letsencrypt.service.js`)
   - Certbot integration
   - Certificate provisioning and renewal
   - Certificate expiration checking
   - Supports webroot, standalone, and DNS challenge modes

4. **NginxService** (`nginx.service.js`)
   - Dynamic Nginx configuration generation
   - SSL certificate path management
   - Nginx config testing and reloading
   - Automatic config cleanup on domain deletion

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# SSL Provider Selection
SSL_PROVIDER=cloudflare  # Cloudflare is default (scalable)
ALLOW_LETSENCRYPT_FALLBACK=true  # Set to 'false' to disable Let's Encrypt fallback

# Cloudflare Configuration
CLOUDFLARE_API_TOKEN=your_token_here
# OR
CLOUDFLARE_API_KEY=your_key_here
CLOUDFLARE_API_EMAIL=your_email@example.com
CLOUDFLARE_SSL_MODE=full  # 'off', 'flexible', 'full', 'strict'
CLOUDFLARE_USE_ORIGIN_CERT=true  # Prefer Origin Certificate (recommended)

# Cloudflare Origin Certificate (for scalability)
# Get from: Cloudflare Dashboard → SSL/TLS → Origin Server
CLOUDFLARE_ORIGIN_CERT_PATH=/etc/ssl/smartstore/certs/cloudflare-origin.crt
CLOUDFLARE_ORIGIN_KEY_PATH=/etc/ssl/smartstore/keys/cloudflare-origin.key

# Let's Encrypt Configuration
CERTBOT_PATH=certbot
CERTBOT_EMAIL=admin@smartstore.org
CERTBOT_CERT_DIR=/etc/letsencrypt/live
CERTBOT_WEBROOT=/var/www/html/.well-known/acme-challenge
CERTBOT_STANDALONE=false
CERTBOT_DNS_CHALLENGE=false
CERTBOT_DNS_PROVIDER=  # 'cloudflare', 'route53', etc.
CERTBOT_TEST_MODE=false  # Use staging environment for testing

# Nginx Configuration
NGINX_SITES_ENABLED=/etc/nginx/sites-enabled/custom-domains
NGINX_CONFIG_PATH=/etc/nginx/nginx.conf
SSL_CERT_PATH=/etc/ssl/smartstore
SSL_KEY_PATH=/etc/ssl/smartstore
ENABLE_NGINX_MANAGEMENT=true

# Application
APP_PORT=3002
APP_HOST=localhost
```

## Setup Instructions

### Option 1: Cloudflare SSL (Recommended)

1. **Get Cloudflare API Token**
   - Go to Cloudflare Dashboard → My Profile → API Tokens
   - Create token with Zone permissions: `Zone:Read`, `Zone:Edit`, `Zone Settings:Edit`

2. **Configure Environment**
   ```env
   SSL_PROVIDER=cloudflare
   CLOUDFLARE_API_TOKEN=your_token_here
   CLOUDFLARE_SSL_MODE=full
   ```

3. **Domain Setup**
   - Add domain to Cloudflare
   - Ensure DNS records are proxied (orange cloud)
   - SSL will be automatically provisioned when domain is verified

### Option 2: Let's Encrypt SSL

1. **Install Certbot**
   ```bash
   sudo apt-get update
   sudo apt-get install certbot python3-certbot-nginx
   ```

2. **Configure Environment**
   ```env
   SSL_PROVIDER=letsencrypt
   CERTBOT_EMAIL=admin@yourdomain.com
   CERTBOT_WEBROOT=/var/www/html/.well-known/acme-challenge
   CERTBOT_STANDALONE=false
   ```

3. **Webroot Mode (Recommended)**
   - Ensure webroot directory exists and is writable
   - Nginx must serve `.well-known/acme-challenge` path
   - Certbot will place challenge files in webroot

4. **Standalone Mode**
   - Set `CERTBOT_STANDALONE=true`
   - Certbot will bind to port 80 temporarily
   - Ensure port 80 is available during provisioning

5. **DNS Challenge Mode** (for wildcard certificates)
   ```env
   CERTBOT_DNS_CHALLENGE=true
   CERTBOT_DNS_PROVIDER=cloudflare
   CLOUDFLARE_API_TOKEN=your_token_here
   ```

### Nginx Setup

1. **Base Nginx Configuration**
   Add to your main `nginx.conf`:
   ```nginx
   # Include custom domain configs
   include /etc/nginx/sites-enabled/custom-domains/*.conf;
   ```

2. **Permissions**
   ```bash
   sudo mkdir -p /etc/nginx/sites-enabled/custom-domains
   sudo chown -R $USER:$USER /etc/nginx/sites-enabled/custom-domains
   ```

3. **Test Configuration**
   ```bash
   sudo nginx -t
   ```

## Usage

### Automatic SSL Provisioning

SSL is automatically provisioned when a domain is verified:

1. User adds custom domain
2. User verifies domain via DNS TXT record
3. System automatically provisions SSL certificate
4. Nginx configuration is updated
5. Nginx is reloaded

### Manual SSL Operations

#### Check SSL Status
```javascript
GET /sites/:siteId/custom-domains/:domainId/ssl/status
```

#### Provision SSL
```javascript
POST /sites/:siteId/custom-domains/:domainId/ssl/provision
```

#### Renew SSL
```javascript
POST /sites/:siteId/custom-domains/:domainId/ssl/renew
```

## Certificate Renewal

### Cloudflare
- Certificates are automatically renewed by Cloudflare
- No action required

### Let's Encrypt
- Certificates expire after 90 days
- Set up cron job for automatic renewal:

```bash
# Add to crontab
0 0 * * * certbot renew --quiet --deploy-hook "nginx -s reload"
```

Or use the service's renewal method:
```javascript
await letsEncryptService.renewAllCertificates();
```

## Troubleshooting

### Cloudflare SSL Issues

1. **Domain not proxied**
   - Ensure DNS records have orange cloud enabled
   - Check Cloudflare dashboard

2. **API Token Issues**
   - Verify token has correct permissions
   - Check token hasn't expired

3. **SSL Mode Issues**
   - Use 'full' or 'strict' for end-to-end encryption
   - 'flexible' only encrypts Cloudflare → visitor

### Let's Encrypt Issues

1. **Certificate Provisioning Fails**
   - Check domain DNS points to server
   - Verify port 80 is accessible (for HTTP challenge)
   - Check webroot directory permissions
   - Review certbot logs: `/var/log/letsencrypt/letsencrypt.log`

2. **Rate Limits**
   - Let's Encrypt has rate limits (50 certs/week per domain)
   - Use `CERTBOT_TEST_MODE=true` for testing
   - Wait 7 days if rate limit exceeded

3. **Nginx Reload Fails**
   - Test config: `nginx -t`
   - Check certificate paths are correct
   - Verify Nginx has read permissions on cert files

### Nginx Issues

1. **Config Not Generated**
   - Check `ENABLE_NGINX_MANAGEMENT=true`
   - Verify directory permissions
   - Check logs for errors

2. **Nginx Reload Fails**
   - Test config: `nginx -t`
   - Check for syntax errors
   - Verify all certificate paths exist

## Security Considerations

1. **API Tokens/Keys**
   - Store securely (use environment variables)
   - Rotate regularly
   - Use least privilege principle

2. **Certificate Storage**
   - Protect private keys (600 permissions)
   - Backup certificates
   - Monitor expiration

3. **Nginx Security**
   - Keep Nginx updated
   - Use strong SSL ciphers
   - Enable HSTS headers

## Testing

### Test Mode (Let's Encrypt)
```env
CERTBOT_TEST_MODE=true
```
Uses Let's Encrypt staging environment (no rate limits, test certificates)

### Disable Nginx Management
```env
ENABLE_NGINX_MANAGEMENT=false
```
Useful for development/testing without Nginx access

## API Endpoints

All SSL endpoints require authentication and site ownership verification.

- `GET /sites/:siteId/custom-domains/:domainId/ssl/status` - Get SSL status
- `POST /sites/:siteId/custom-domains/:domainId/ssl/provision` - Provision SSL
- `POST /sites/:siteId/custom-domains/:domainId/ssl/renew` - Renew SSL

## Next Steps

1. Set up Cloudflare account and API token
2. Configure environment variables
3. Test with a domain
4. Set up certificate renewal cron job (for Let's Encrypt)
5. Monitor SSL certificate expiration

