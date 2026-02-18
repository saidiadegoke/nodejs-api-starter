/**
 * Traefik Configuration Service
 * Generates Traefik dynamic configuration files for custom domains
 */

const fs = require('fs').promises;
const path = require('path');
const pool = require('../../../db/pool');
const { logger } = require('../../../shared/utils/logger');
const CustomDomainModel = require('../models/customDomain.model');
const SiteModel = require('../models/site.model');

class TraefikConfigService {
  /**
   * Get the Traefik dynamic config directory
   */
  static getTraefikConfigDir() {
    return process.env.TRAEFIK_DYNAMIC_CONFIG_DIR || '/etc/dokploy/traefik/dynamic';
  }

  /**
   * Test write permissions to Traefik config directory
   * Useful for validating setup before generating configs
   */
  static async testWritePermissions() {
    const configDir = this.getTraefikConfigDir();
    const testFile = path.join(configDir, '.traefik-write-test');

    try {
      // Ensure directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Try to write a test file
      const testContent = `# Traefik write test - ${new Date().toISOString()}\n# This file can be safely deleted\n`;
      await fs.writeFile(testFile, testContent, 'utf8');

      // Verify file was written
      const stats = await fs.stat(testFile);
      if (stats.isFile()) {
        logger.info(`[TraefikConfigService] ✓ Write test successful: ${testFile}`);
        
        // Clean up test file
        await fs.unlink(testFile);
        
        return {
          success: true,
          message: `Write permissions OK: ${configDir}`,
          directory: configDir,
        };
      } else {
        throw new Error('Test file was not created');
      }
    } catch (error) {
      logger.error(`[TraefikConfigService] ✗ Write test failed: ${error.message}`);
      return {
        success: false,
        message: `Write permissions failed: ${error.message}`,
        directory: configDir,
        error: error.message,
      };
    }
  }

  /**
   * Generate Traefik config filename for a domain.
   * Filename is the custom domain + .yml (e.g. testapp.morgengreen.cloud.yml) so it's unique and easy to regenerate by name.
   */
  static getConfigFilename(domain) {
    const safe = domain.toLowerCase().trim().replace(/[^a-z0-9.-]/g, '');
    return `${safe || 'domain'}.yml`;
  }

  /**
   * Get certificate configuration for a custom domain
   * Returns certificate info if Cloudflare cert is available, otherwise null (for Let's Encrypt)
   */
  static async getCertificateConfig(customDomain) {
    // Check if domain has a certificate assigned (Cloudflare)
    if (customDomain.certificate_id) {
      // Get certificate info from database
      const certResult = await pool.query(
        `SELECT cert_path, key_path, provider 
         FROM ssl_certificates 
         WHERE id = $1`,
        [customDomain.certificate_id]
      );

      if (certResult.rows.length > 0) {
        const cert = certResult.rows[0];
        // Only use if paths exist and provider is Cloudflare
        if (cert.cert_path && cert.key_path && cert.provider === 'cloudflare') {
          return {
            certFile: cert.cert_path,
            keyFile: cert.key_path,
            provider: cert.provider,
            useFileCert: true,
          };
        }
      }
    }

    // Default: Use Let's Encrypt via Traefik's automatic cert resolver
    return {
      useFileCert: false,
      provider: 'letsencrypt',
    };
  }

  /**
   * Generate Traefik dynamic config for a custom domain
   */
  static async generateDomainConfig(customDomain, site) {
    const domain = customDomain.domain;
    const wwwDomain = `www.${domain}`;
    
    // Get certificate configuration
    // Default: Let's Encrypt (Traefik handles automatically)
    // Fallback: Cloudflare certificate if available
    const certConfig = await this.getCertificateConfig(customDomain);
    
    // Check if we have file-based certificate (Cloudflare)
    const useFileCert = certConfig.useFileCert === true;
    
    // App service URL (same as in traefik-smartstore-direct.yml)
    const appServiceUrl = process.env.SMARTSTORE_APP_SERVICE_URL || 
                         'http://smartstore-smartstore-app-npv0bl:4060';

    const config = {
      http: {
        routers: {},
        services: {},
        middlewares: {},
      },
    };

    // HTTP router (always redirect to HTTPS)
    config.http.routers[`${domain}-http`] = {
      rule: `Host(\`${domain}\`) || Host(\`${wwwDomain}\`)`,
      service: `${domain}-service`,
      entryPoints: ['web'],
      middlewares: ['redirect-to-https'],
      priority: 10,
    };

    // HTTPS router
    config.http.routers[`${domain}-https`] = {
      rule: `Host(\`${domain}\`) || Host(\`${wwwDomain}\`)`,
      service: `${domain}-service`,
      entryPoints: ['websecure'],
      middlewares: ['add-forwarded-header'],
      priority: 10,
    };

    // TLS configuration
    if (useFileCert) {
      // Use file-based certificate (Cloudflare Origin Certificate)
      config.http.routers[`${domain}-https`].tls = {
        certificates: [
          {
            certFile: certConfig.certFile,
            keyFile: certConfig.keyFile,
          },
        ],
      };
    } else {
      // Use Let's Encrypt via Traefik's automatic cert resolver
      // Traefik will automatically provision and renew certificates
      // Default cert resolver name (should match Traefik static config)
      const certResolver = process.env.TRAEFIK_CERT_RESOLVER || 'letsencrypt';
      config.http.routers[`${domain}-https`].tls = {
        certResolver: certResolver,
      };
    }

    // Service definition
    config.http.services[`${domain}-service`] = {
      loadBalancer: {
        servers: [
          {
            url: appServiceUrl,
          },
        ],
        passHostHeader: true,
        healthCheck: {
          path: '/health',
          interval: '30s',
          timeout: '5s',
        },
      },
    };

    // Middlewares
    config.http.middlewares['redirect-to-https'] = {
      redirectScheme: {
        scheme: 'https',
        permanent: true,
      },
    };

    config.http.middlewares['add-forwarded-header'] = {
      plugin: {
        AddForwardedHeader: {
          by: 'Traefik',
        },
      },
    };

    return { config, useFileCert };
  }

  /**
   * Write Traefik config file for a domain
   * @returns {{ filePath: string, usesCertResolver: boolean }}
   */
  static async writeDomainConfig(customDomain, site) {
    try {
      const { config, useFileCert } = await this.generateDomainConfig(customDomain, site);
      const filename = this.getConfigFilename(customDomain.domain);
      const configDir = this.getTraefikConfigDir();
      const filePath = path.join(configDir, filename);

      // Ensure directory exists
      await fs.mkdir(configDir, { recursive: true });

      // Convert config to YAML string
      const yamlContent = this.configToYAML(config);

      // Write file
      await fs.writeFile(filePath, yamlContent, 'utf8');

      logger.info(`[TraefikConfigService] Generated config for domain: ${customDomain.domain} at ${filePath}`);

      return { filePath, usesCertResolver: !useFileCert };
    } catch (error) {
      logger.error(`[TraefikConfigService] Error writing config for ${customDomain.domain}:`, error);
      throw error;
    }
  }

  /**
   * Convert config object to YAML string
   * Simple YAML generator for Traefik config structure
   */
  static configToYAML(config, indent = 0) {
    const indentStr = '  '.repeat(indent);
    let yaml = '';

    for (const [key, value] of Object.entries(config)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (Array.isArray(value)) {
        yaml += `${indentStr}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${indentStr}  -\n${this.configToYAML(item, indent + 2)}`;
          } else {
            yaml += `${indentStr}  - ${this.stringifyValue(item)}\n`;
          }
        }
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Check if it's a special object (like plugin config)
        if (key === 'plugin' || key === 'redirectScheme' || key === 'loadBalancer' || key === 'healthCheck' || key === 'certificates' || key === 'tls') {
          yaml += `${indentStr}${key}:\n${this.configToYAML(value, indent + 1)}`;
        } else {
          yaml += `${indentStr}${key}:\n${this.configToYAML(value, indent + 1)}`;
        }
      } else {
        yaml += `${indentStr}${key}: ${this.stringifyValue(value)}\n`;
      }
    }

    return yaml;
  }

  /**
   * Stringify a value for YAML
   */
  static stringifyValue(value) {
    if (typeof value === 'string') {
      // Escape backticks and quotes if needed
      if (value.includes('`') || value.includes("'") || value.includes('"')) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    return String(value);
  }

  /**
   * Generate or update Traefik config for a custom domain.
   * Writes to TRAEFIK_DYNAMIC_CONFIG_DIR (e.g. /etc/dokploy/traefik/dynamic/) so Traefik routes
   * Host(custom-domain) to the app. Call this when the domain is added (or anytime) so that once
   * DNS points here, the server already has the route and does not return 404.
   * When using certResolver (e.g. letsencrypt), Traefik will obtain/renew the certificate.
   * @returns {{ filePath: string, usesCertResolver: boolean } | null}
   */
  static async generateConfigForDomain(domainId) {
    try {
      const customDomain = await CustomDomainModel.getCustomDomainById(domainId);
      if (!customDomain) {
        throw new Error(`Custom domain with ID ${domainId} not found`);
      }

      const site = await SiteModel.getSiteById(customDomain.site_id);
      if (!site) {
        throw new Error(`Site with ID ${customDomain.site_id} not found`);
      }

      const result = await this.writeDomainConfig(customDomain, site);
      logger.info(`[TraefikConfigService] Successfully generated Traefik config for ${customDomain.domain}`);
      return result;
    } catch (error) {
      logger.error(`[TraefikConfigService] Error generating config for domain ID ${domainId}:`, error);
      throw error;
    }
  }

  /**
   * Delete Traefik config file for a domain
   */
  static async deleteDomainConfig(domain) {
    try {
      const filename = this.getConfigFilename(domain);
      const configDir = this.getTraefikConfigDir();
      const filePath = path.join(configDir, filename);

      await fs.unlink(filePath);

      logger.info(`[TraefikConfigService] Deleted config for domain: ${domain} at ${filePath}`);

      return true;
    } catch (error) {
      // Ignore error if file doesn't exist
      if (error.code === 'ENOENT') {
        logger.warn(`[TraefikConfigService] Config file not found for ${domain}, skipping deletion`);
        return true;
      }
      logger.error(`[TraefikConfigService] Error deleting config for ${domain}:`, error);
      throw error;
    }
  }

  /**
   * Regenerate all Traefik configs for verified custom domains
   * Useful for bulk updates or after certificate changes
   */
  static async regenerateAllConfigs() {
    try {
      // Get all verified custom domains
      const result = await pool.query(
        `SELECT cd.*, s.slug as site_slug, s.name as site_name
         FROM custom_domains cd
         JOIN sites s ON cd.site_id = s.id
         WHERE cd.verified = true
         ORDER BY cd.domain`
      );

      const domains = result.rows;
      logger.info(`[TraefikConfigService] Regenerating configs for ${domains.length} verified domains`);

      const results = [];
      for (const customDomain of domains) {
        try {
          const site = {
            id: customDomain.site_id,
            slug: customDomain.site_slug,
            name: customDomain.site_name,
          };
          const writeResult = await this.writeDomainConfig(customDomain, site);
          results.push({ domain: customDomain.domain, success: true, filePath: writeResult.filePath });
        } catch (error) {
          logger.error(`[TraefikConfigService] Failed to generate config for ${customDomain.domain}:`, error);
          results.push({ domain: customDomain.domain, success: false, error: error.message });
        }
      }

      return results;
    } catch (error) {
      logger.error('[TraefikConfigService] Error regenerating all configs:', error);
      throw error;
    }
  }
}

module.exports = TraefikConfigService;

