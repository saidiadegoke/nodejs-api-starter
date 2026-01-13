const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { logger } = require('../../../shared/utils/logger');

const execAsync = promisify(exec);

class NginxService {
  constructor() {
    // Nginx config paths (configurable via env)
    this.nginxSitesEnabled = process.env.NGINX_SITES_ENABLED || '/etc/nginx/sites-enabled/custom-domains';
    this.nginxConfigPath = process.env.NGINX_CONFIG_PATH || '/etc/nginx/nginx.conf';
    this.sslCertPath = process.env.SSL_CERT_PATH || '/etc/ssl/smartstore';
    this.sslKeyPath = process.env.SSL_KEY_PATH || '/etc/ssl/smartstore';
    
    // App service configuration
    // Use localhost if services are on same server, or domain if distributed
    this.appPort = process.env.APP_PORT || 4060;
    this.appHost = process.env.APP_HOST || 'localhost'; // Default to localhost for same-server
    
    // API service configuration (for API-specific routes if needed)
    this.apiPort = process.env.API_PORT || 4050;
    this.apiHost = process.env.API_HOST || process.env.APP_HOST || 'localhost';
    
    // Web service configuration (for dashboard/admin routes if needed)
    this.webPort = process.env.WEB_PORT || 4070;
    this.webHost = process.env.WEB_HOST || process.env.APP_HOST || 'localhost';
  }

  /**
   * Generate Nginx configuration for a custom domain
   */
  async generateNginxConfig(domain, sslCertPath = null, sslKeyPath = null) {
    const config = `
# Auto-generated configuration for ${domain}
# DO NOT EDIT MANUALLY - This file is managed by SmartStore

server {
    listen 80;
    server_name ${domain} www.${domain};
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain} www.${domain};

    ${sslCertPath && sslKeyPath ? `
    # SSL Certificate Configuration
    ssl_certificate ${sslCertPath};
    ssl_certificate_key ${sslKeyPath};
    
    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ` : `
    # SSL not yet configured - will be updated when certificate is provisioned
    # listen 443 ssl http2;
    # server_name ${domain} www.${domain};
    `}

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy Configuration
    location / {
        proxy_pass http://${this.appHost}:${this.appPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health Check Endpoint
    location /health {
        access_log off;
        return 200 "healthy\\n";
        add_header Content-Type text/plain;
    }
}
`;

    return config.trim();
  }

  /**
   * Write Nginx configuration file for a domain
   */
  async writeNginxConfig(domain, sslCertPath = null, sslKeyPath = null) {
    try {
      // Ensure directory exists
      const configDir = path.dirname(this.nginxSitesEnabled);
      try {
        await fs.mkdir(configDir, { recursive: true });
      } catch (error) {
        if (error.code === 'EACCES') {
          // Try with sudo if permission denied
          logger.warn(`[NginxService] Permission denied creating directory, trying with sudo`);
          await this.executeWithSudo(`mkdir -p ${configDir}`);
        } else {
          throw error;
        }
      }

      // Generate config
      const config = await this.generateNginxConfig(domain, sslCertPath, sslKeyPath);

      // Write config file
      const configFile = path.join(configDir, `${domain.replace(/\./g, '_')}.conf`);
      try {
        await fs.writeFile(configFile, config, 'utf8');
      } catch (error) {
        if (error.code === 'EACCES') {
          // Write to temp file first, then move with sudo
          const tempFile = `/tmp/nginx-${domain.replace(/\./g, '_')}-${Date.now()}.conf`;
          await fs.writeFile(tempFile, config, 'utf8');
          await this.executeWithSudo(`mv ${tempFile} ${configFile}`);
          await this.executeWithSudo(`chmod 644 ${configFile}`);
        } else {
          throw error;
        }
      }

      logger.info(`[NginxService] Nginx config written for ${domain}: ${configFile}`);
      return configFile;
    } catch (error) {
      logger.error(`[NginxService] Error writing Nginx config for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Remove Nginx configuration file for a domain
   */
  async removeNginxConfig(domain) {
    try {
      const configDir = path.dirname(this.nginxSitesEnabled);
      const configFile = path.join(configDir, `${domain.replace(/\./g, '_')}.conf`);
      
      await fs.unlink(configFile);
      logger.info(`[NginxService] Nginx config removed for ${domain}: ${configFile}`);
      return true;
    } catch (error) {
      // File might not exist - that's okay
      if (error.code !== 'ENOENT') {
        logger.error(`[NginxService] Error removing Nginx config for ${domain}:`, error);
        throw error;
      }
      return true;
    }
  }

  /**
   * Update SSL certificate paths in Nginx config
   */
  async updateSSLConfig(domain, sslCertPath, sslKeyPath) {
    try {
      // Remove old config
      await this.removeNginxConfig(domain);
      
      // Write new config with SSL
      await this.writeNginxConfig(domain, sslCertPath, sslKeyPath);
      
      logger.info(`[NginxService] SSL config updated for ${domain}`);
      return true;
    } catch (error) {
      logger.error(`[NginxService] Error updating SSL config for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Test Nginx configuration
   * Supports both Docker nginx and host nginx
   */
  async testNginxConfig() {
    try {
      // Determine test command based on deployment type
      const nginxContainer = process.env.NGINX_CONTAINER_NAME || 'smartstore-nginx';
      const useDocker = process.env.NGINX_USE_DOCKER !== 'false';
      const useSystemctl = process.env.NGINX_USE_SYSTEMCTL === 'true';
      
      let testCommand;
      
      if (useDocker) {
        // Test Docker nginx container config
        testCommand = `docker exec ${nginxContainer} nginx -t`;
      } else if (useSystemctl) {
        // Test via systemctl
        testCommand = 'nginx -t'; // systemctl doesn't have a test command, use direct nginx
      } else {
        // Direct nginx test (assumes nginx is in PATH)
        testCommand = 'nginx -t';
      }
      
      // Use sudo if configured
      const { stdout, stderr } = await this.executeWithSudo(testCommand);
      if (stderr && !stderr.includes('test is successful')) {
        throw new Error(stderr);
      }
      logger.info('[NginxService] Nginx configuration test passed');
      return { success: true, output: stdout };
    } catch (error) {
      logger.error('[NginxService] Nginx configuration test failed:', error);
      throw new Error(`Nginx configuration test failed: ${error.message}`);
    }
  }

  /**
   * Reload Nginx (after config changes)
   * Supports both Docker nginx and host nginx
   */
  async reloadNginx() {
    try {
      // Test config first (with sudo if needed)
      const testCommand = 'nginx -t';
      await this.executeWithSudo(testCommand);

      // Determine reload command based on deployment type
      // If nginx is in Docker, use docker exec
      // If nginx is on host, use systemctl or direct nginx command
      const nginxContainer = process.env.NGINX_CONTAINER_NAME || 'smartstore-nginx';
      const useDocker = process.env.NGINX_USE_DOCKER !== 'false';
      const useSystemctl = process.env.NGINX_USE_SYSTEMCTL === 'true';
      
      let reloadCommand;
      
      if (useDocker) {
        // Reload Docker nginx container
        reloadCommand = `docker exec ${nginxContainer} nginx -s reload`;
      } else if (useSystemctl) {
        // Reload via systemctl (if nginx is a systemd service)
        reloadCommand = 'systemctl reload nginx';
      } else {
        // Direct nginx reload (assumes nginx is in PATH)
        reloadCommand = 'nginx -s reload';
      }
      
      // Use sudo if configured
      const { stdout, stderr } = await this.executeWithSudo(reloadCommand);
      
      if (stderr && !stderr.includes('successful') && !stderr.includes('reloaded')) {
        throw new Error(stderr);
      }
      
      logger.info(`[NginxService] Nginx reloaded successfully using: ${reloadCommand}`);
      return { success: true, output: stdout };
    } catch (error) {
      logger.error('[NginxService] Error reloading Nginx:', error);
      throw new Error(`Failed to reload Nginx: ${error.message}`);
    }
  }

  /**
   * Check if Nginx reload is available (not in read-only mode)
   */
  isNginxAvailable() {
    // In development/test mode, Nginx operations might be disabled
    return process.env.ENABLE_NGINX_MANAGEMENT !== 'false';
  }
}

// Export singleton instance
const nginxService = new NginxService();
module.exports = nginxService;

