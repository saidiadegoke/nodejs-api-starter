# SmartStore API: Implementation Plan

This document provides a detailed, actionable implementation plan with checkboxes to track progress for each architectural component.

**Selected Architecture:**
- Multi-tenancy: Row-level security (shared database)
- Domain routing: Subdomain + Custom domain support
- SSL/TLS: Cloudflare integration + Let's Encrypt fallback
- Platform updates: Versioned engines + Feature flags
- Backend: Node.js + Express
- Database: Managed PostgreSQL
- Reverse proxy: Nginx
- Hosting: VPS + Managed Database

---

## Phase 1: Foundation & Infrastructure Setup

### 1.1 Infrastructure Provisioning

#### VPS Setup
- [ ] Choose VPS provider (DigitalOcean/AWS/GCP/Hetzner)
- [ ] Provision VPS instance (minimum 2GB RAM, 2 vCPU recommended)
- [ ] Configure SSH key access
- [ ] Set up firewall rules (UFW or iptables)
  - [ ] Allow SSH (port 22)
  - [ ] Allow HTTP (port 80)
  - [ ] Allow HTTPS (port 443)
  - [ ] Allow application port (3000 or custom)
- [ ] Install system updates
- [ ] Configure timezone and NTP
- [ ] Set up swap space (if needed)

#### Managed Database Setup
- [ ] Choose managed PostgreSQL provider (AWS RDS, DigitalOcean Managed DB, etc.)
- [ ] Create PostgreSQL database instance
- [ ] Configure database connection settings
  - [ ] Set database name
  - [ ] Create admin user
  - [ ] Configure connection pooling settings
- [ ] Set up database backups (automated daily)
- [ ] Configure database firewall/security groups
  - [ ] Whitelist VPS IP address
  - [ ] Restrict access to VPS only
- [ ] Test database connection from VPS
- [ ] Document connection string format

#### DNS Setup
- [ ] Register/configure `smartstore.ng.ng` domain
- [ ] Set up Cloudflare account
- [ ] Add domain to Cloudflare
- [ ] Configure DNS records in Cloudflare:
  - [ ] A record: `@` → VPS IP address
  - [ ] A record: `*.smartstore.ng.ng` → VPS IP address (wildcard subdomain)
  - [ ] A record: `www.smartstore.ng.ng` → VPS IP address
- [ ] Verify DNS propagation
- [ ] Test subdomain resolution (e.g., `test.smartstore.ng.ng`)

---

### 1.2 SSL/TLS Certificate Management

#### Cloudflare SSL Setup (Primary)
- [ ] Configure Cloudflare SSL/TLS mode
  - [ ] Set to "Full" or "Full (strict)" mode
  - [ ] Enable "Always Use HTTPS"
  - [ ] Enable "Automatic HTTPS Rewrites"
- [ ] Generate Origin Certificate (for Cloudflare → VPS communication)
  - [ ] Download certificate and private key
  - [ ] Store securely on VPS
- [ ] Configure Cloudflare Page Rules (if needed)
- [ ] Test SSL connection through Cloudflare
- [ ] Verify SSL certificate validity

#### Let's Encrypt Setup (Fallback)
- [ ] Install Certbot on VPS
  ```bash
  sudo apt-get update
  sudo apt-get install certbot python3-certbot-nginx
  ```
- [ ] Configure Certbot for automatic renewal
  - [ ] Set up cron job: `0 0 * * * certbot renew --quiet`
- [ ] Test certificate generation (dry-run)
- [ ] Create script for manual certificate generation (for custom domains)
- [ ] Document Let's Encrypt rate limits and usage
- [ ] Set up monitoring for certificate expiration

#### SSL Certificate Management System
- [ ] Create database table for SSL certificate tracking
  ```sql
  CREATE TABLE ssl_certificates (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    certificate_path TEXT,
    key_path TEXT,
    provider VARCHAR(50), -- 'cloudflare' or 'letsencrypt'
    expires_at TIMESTAMP,
    auto_renew BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Create API endpoint for SSL status checking
- [ ] Create background job for certificate renewal monitoring
- [ ] Set up alerts for expiring certificates

---

### 1.3 Reverse Proxy (Nginx) Setup

#### Nginx Installation & Configuration
- [ ] Install Nginx on VPS
  ```bash
  sudo apt-get install nginx
  ```
- [ ] Create base Nginx configuration structure
  - [ ] Main config: `/etc/nginx/nginx.conf`
  - [ ] Sites directory: `/etc/nginx/sites-available/`
  - [ ] Sites enabled: `/etc/nginx/sites-enabled/`
- [ ] Configure wildcard catch-all server block
  ```nginx
  server {
      listen 80;
      server_name _;
      return 301 https://$host$request_uri;
  }
  
  server {
      listen 443 ssl http2;
      server_name _;
      
      ssl_certificate /etc/ssl/certs/cloudflare-origin.crt;
      ssl_certificate_key /etc/ssl/private/cloudflare-origin.key;
      
      location / {
          proxy_pass http://localhost:3000;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```
- [ ] Test Nginx configuration: `sudo nginx -t`
- [ ] Enable and start Nginx service
- [ ] Configure Nginx to start on boot
- [ ] Set up Nginx log rotation

#### Nginx Security Headers
- [ ] Add security headers to Nginx config
  - [ ] Strict-Transport-Security (HSTS)
  - [ ] X-Frame-Options
  - [ ] X-Content-Type-Options
  - [ ] Referrer-Policy
  - [ ] Content-Security-Policy (basic)
- [ ] Test headers with `curl -I`

#### Nginx Performance Tuning
- [ ] Configure worker processes and connections
- [ ] Enable gzip compression
- [ ] Configure caching headers for static assets
- [ ] Set up rate limiting (if needed)

---

## Phase 2: Database Schema & Multi-Tenancy

### 2.1 Database Schema Design

#### Core Tables
- [ ] Create `sites` table
  ```sql
  CREATE TABLE sites (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    primary_domain VARCHAR(255),
    engine_version VARCHAR(20) DEFAULT 'v1.0.0',
    status VARCHAR(50) DEFAULT 'active',
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_sites_slug ON sites(slug);
  CREATE INDEX idx_sites_primary_domain ON sites(primary_domain);
  ```
- [ ] Create `custom_domains` table
  ```sql
  CREATE TABLE custom_domains (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    domain VARCHAR(255) UNIQUE NOT NULL,
    verified BOOLEAN DEFAULT false,
    verification_token VARCHAR(255),
    ssl_status VARCHAR(50) DEFAULT 'pending',
    ssl_provider VARCHAR(50), -- 'cloudflare' or 'letsencrypt'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_custom_domains_site_id ON custom_domains(site_id);
  CREATE INDEX idx_custom_domains_domain ON custom_domains(domain);
  ```
- [ ] Create `users` table
  ```sql
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Create `site_members` table (for multi-user sites)
  ```sql
  CREATE TABLE site_members (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'editor',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(site_id, user_id)
  );
  ```

#### Tenant-Scoped Tables (with site_id)
- [ ] Create `pages` table
  ```sql
  CREATE TABLE pages (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    slug VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    content JSONB,
    published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(site_id, slug)
  );
  CREATE INDEX idx_pages_site_id ON pages(site_id);
  ```
- [ ] Create `components` table
  ```sql
  CREATE TABLE components (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100),
    config JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_components_site_id ON components(site_id);
  ```
- [ ] Create `themes` table
  ```sql
  CREATE TABLE themes (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    name VARCHAR(255),
    config JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  CREATE INDEX idx_themes_site_id ON themes(site_id);
  ```

### 2.2 Row-Level Security Implementation

#### Database-Level Security
- [ ] Enable Row Level Security (RLS) on PostgreSQL (if using PostgreSQL 9.5+)
- [ ] Create database functions for tenant isolation
  ```sql
  CREATE OR REPLACE FUNCTION get_site_id_from_hostname(hostname TEXT)
  RETURNS INTEGER AS $$
  DECLARE
    site_slug TEXT;
    site_id INTEGER;
  BEGIN
    -- Extract slug from subdomain (e.g., testshop.smartstore.ng.ng -> testshop)
    IF hostname LIKE '%.smartstore.ng.ng' THEN
      site_slug := SPLIT_PART(hostname, '.', 1);
    ELSE
      -- Look up custom domain
      SELECT site_id INTO site_id FROM custom_domains WHERE domain = hostname;
      RETURN site_id;
    END IF;
    
    -- Get site_id from slug
    SELECT id INTO site_id FROM sites WHERE slug = site_slug;
    RETURN site_id;
  END;
  $$ LANGUAGE plpgsql;
  ```
- [ ] Create database triggers to enforce site_id presence
  ```sql
  CREATE OR REPLACE FUNCTION ensure_site_id()
  RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.site_id IS NULL THEN
      RAISE EXCEPTION 'site_id cannot be NULL';
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  CREATE TRIGGER pages_site_id_check
    BEFORE INSERT OR UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION ensure_site_id();
  ```

#### Application-Level Security
- [ ] Create middleware to extract tenant from hostname
  ```javascript
  // middleware/tenantResolver.js
  async function resolveTenant(req, res, next) {
    const hostname = req.hostname;
    let site;
    
    // Check if subdomain
    if (hostname.endsWith('.smartstore.ng.ng')) {
      const slug = hostname.split('.')[0];
      site = await db.query('SELECT * FROM sites WHERE slug = $1', [slug]);
    } else {
      // Custom domain lookup
      site = await db.query(
        'SELECT s.* FROM sites s JOIN custom_domains cd ON s.id = cd.site_id WHERE cd.domain = $1 AND cd.verified = true',
        [hostname]
      );
    }
    
    if (!site) {
      return res.status(404).send('Site not found');
    }
    
    req.tenant = site;
    req.siteId = site.id;
    next();
  }
  ```
- [ ] Create database query helper that always includes site_id
  ```javascript
  // utils/db.js
  function queryWithTenant(sql, params, siteId) {
    // Ensure site_id is in WHERE clause
    // Prevent SQL injection
    return db.query(sql, [...params, siteId]);
  }
  ```
- [ ] Add site_id validation to all tenant-scoped routes
- [ ] Create unit tests for tenant isolation
  - [ ] Test that users can't access other tenants' data
  - [ ] Test that queries always include site_id
  - [ ] Test hostname resolution (subdomain and custom domain)

---

## Phase 3: Backend Application Setup

### 3.1 Node.js & Express Setup

#### Project Initialization
- [ ] Initialize Node.js project
  ```bash
  npm init -y
  ```
- [ ] Install Express and core dependencies
  ```bash
  npm install express cors helmet express-rate-limit
  npm install dotenv pg bcrypt jsonwebtoken
  npm install --save-dev nodemon @types/node typescript
  ```
- [ ] Set up TypeScript (optional but recommended)
  - [ ] Create `tsconfig.json`
  - [ ] Configure build scripts
- [ ] Create project directory structure
  ```
  /src
    /middleware
    /routes
    /controllers
    /models
    /utils
    /engines
      /v1
      /v2
    /config
  ```
- [ ] Set up environment variables
  - [ ] Create `.env.example` file
  - [ ] Create `.env` file (add to .gitignore)
  - [ ] Configure database connection string
  - [ ] Configure JWT secret
  - [ ] Configure port and host

#### Express Application Setup
- [ ] Create main Express app file
  ```javascript
  // src/app.js
  const express = require('express');
  const helmet = require('helmet');
  const cors = require('cors');
  const rateLimit = require('express-rate-limit');
  
  const app = express();
  
  // Security middleware
  app.use(helmet());
  app.use(cors());
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  });
  app.use(limiter);
  
  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Tenant resolution middleware (must be early)
  app.use(require('./middleware/tenantResolver'));
  
  // Routes
  app.use('/api', require('./routes'));
  
  module.exports = app;
  ```
- [ ] Create server entry point
  ```javascript
  // src/server.js
  const app = require('./app');
  const PORT = process.env.PORT || 3000;
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  ```
- [ ] Set up error handling middleware
- [ ] Set up logging (Winston or similar)
- [ ] Configure process management (PM2)
  ```bash
  npm install -g pm2
  pm2 start src/server.js --name smartstore-api
  pm2 save
  pm2 startup
  ```

### 3.2 Domain Routing Implementation

#### Subdomain Routing
- [ ] Implement subdomain extraction middleware
  ```javascript
  // middleware/subdomainExtractor.js
  function extractSubdomain(req, res, next) {
    const hostname = req.hostname;
    if (hostname.endsWith('.smartstore.ng.ng')) {
      const parts = hostname.split('.');
      req.subdomain = parts[0];
    }
    next();
  }
  ```
- [ ] Create route handler for subdomain sites
- [ ] Test subdomain routing
  - [ ] `testshop.smartstore.ng.ng` → resolves to site with slug `testshop`

#### Custom Domain Routing
- [ ] Create API endpoint for adding custom domain
  ```javascript
  // POST /api/sites/:siteId/domains
  async function addCustomDomain(req, res) {
    const { domain } = req.body;
    const siteId = req.siteId;
    
    // Generate verification token
    const token = generateVerificationToken();
    
    // Store in database
    await db.query(
      'INSERT INTO custom_domains (site_id, domain, verification_token) VALUES ($1, $2, $3)',
      [siteId, domain, token]
    );
    
    // Return DNS instructions
    res.json({
      domain,
      verificationToken: token,
      instructions: {
        type: 'TXT',
        name: '_smartstore-verification',
        value: token
      }
    });
  }
  ```
- [ ] Create domain verification endpoint
  ```javascript
  // POST /api/sites/:siteId/domains/:domainId/verify
  async function verifyDomain(req, res) {
    const { domainId } = req.params;
    
    // Check DNS TXT record
    const domain = await getDomainFromDB(domainId);
    const txtRecords = await dns.resolveTxt(`_smartstore-verification.${domain.domain}`);
    
    if (txtRecords.includes(domain.verification_token)) {
      await db.query('UPDATE custom_domains SET verified = true WHERE id = $1', [domainId]);
      res.json({ verified: true });
    } else {
      res.status(400).json({ error: 'Verification failed' });
    }
  }
  ```
- [ ] Create custom domain lookup in tenant resolver
- [ ] Implement SSL certificate provisioning for custom domains
  - [ ] Cloudflare API integration (if domain uses Cloudflare)
  - [ ] Let's Encrypt via Certbot (fallback)
- [ ] Test custom domain routing
  - [ ] `testshop.com.ng` → resolves to associated site

#### Domain Management API
- [ ] List domains for a site: `GET /api/sites/:siteId/domains`
- [ ] Remove domain: `DELETE /api/sites/:siteId/domains/:domainId`
- [ ] Check domain status: `GET /api/sites/:siteId/domains/:domainId/status`
- [ ] Update SSL status: Background job to check SSL certificate status

---

## Phase 4: Platform Update & Versioning System

### 4.1 Versioned Engine Architecture

#### Engine Structure Setup
- [ ] Create engine directory structure
  ```
  /src/engines
    /v1
      /index.js
      /render.js
      /components.js
      /migrate.js
    /v2
      /index.js
      /render.js
      /components.js
      /migrate.js
  ```
- [ ] Create base engine interface
  ```javascript
  // src/engines/base/Engine.js
  class Engine {
    constructor(version) {
      this.version = version;
    }
    
    async render(site, page, req, res) {
      throw new Error('render() must be implemented');
    }
    
    async migrate(siteId, fromVersion) {
      throw new Error('migrate() must be implemented');
    }
  }
  ```
- [ ] Implement v1.0.0 engine
  ```javascript
  // src/engines/v1/index.js
  const Engine = require('../base/Engine');
  
  class V1Engine extends Engine {
    constructor() {
      super('v1.0.0');
    }
    
    async render(site, page, req, res) {
      // Basic rendering logic
      const html = this.generateHTML(site, page);
      res.send(html);
    }
    
    async migrate(siteId, fromVersion) {
      // Migration from previous version (if any)
      // For v1, this is a no-op
    }
  }
  
  module.exports = new V1Engine();
  ```
- [ ] Create engine loader utility
  ```javascript
  // src/utils/engineLoader.js
  function loadEngine(version) {
    try {
      return require(`../engines/${version}`);
    } catch (error) {
      throw new Error(`Engine version ${version} not found`);
    }
  }
  ```
- [ ] Integrate engine loader into site rendering
  ```javascript
  // routes/site.js
  app.get('*', async (req, res) => {
    const site = req.tenant;
    const engine = loadEngine(site.engine_version);
    const page = await getPageBySlug(site.id, req.path);
    await engine.render(site, page, req, res);
  });
  ```

#### Migration System
- [ ] Create migration script template
  ```javascript
  // src/engines/v2/migrate.js
  async function migrate(siteId) {
    // Backup current site data
    await backupSiteData(siteId);
    
    // Transform page schemas
    await transformPageSchemas(siteId);
    
    // Update components
    await updateComponents(siteId);
    
    // Update site engine version
    await db.query('UPDATE sites SET engine_version = $1 WHERE id = $2', ['v2.0.0', siteId]);
  }
  ```
- [ ] Create migration API endpoint
  ```javascript
  // POST /api/sites/:siteId/upgrade
  async function upgradeSite(req, res) {
    const siteId = req.siteId;
    const targetVersion = req.body.version;
    
    const currentSite = await getSite(siteId);
    const currentVersion = currentSite.engine_version;
    
    // Load engines
    const currentEngine = loadEngine(currentVersion);
    const targetEngine = loadEngine(targetVersion);
    
    // Run migration
    await targetEngine.migrate(siteId, currentVersion);
    
    res.json({ success: true, version: targetVersion });
  }
  ```
- [ ] Create rollback functionality
  ```javascript
  // POST /api/sites/:siteId/rollback
  async function rollbackSite(req, res) {
    const siteId = req.siteId;
    // Restore from backup
    await restoreSiteFromBackup(siteId);
    res.json({ success: true });
  }
  ```

### 4.2 Feature Flags System

#### Feature Flag Infrastructure
- [ ] Create feature flags table
  ```sql
  CREATE TABLE feature_flags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    rollout_percentage INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE site_feature_flags (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    feature_flag_id INTEGER REFERENCES feature_flags(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT false,
    UNIQUE(site_id, feature_flag_id)
  );
  ```
- [ ] Create feature flag service
  ```javascript
  // services/featureFlags.js
  class FeatureFlagService {
    async isEnabled(siteId, flagName) {
      // Check site-specific override
      const siteFlag = await db.query(
        'SELECT enabled FROM site_feature_flags sff JOIN feature_flags ff ON sff.feature_flag_id = ff.id WHERE sff.site_id = $1 AND ff.name = $2',
        [siteId, flagName]
      );
      
      if (siteFlag.length > 0) {
        return siteFlag[0].enabled;
      }
      
      // Check global flag with rollout percentage
      const flag = await db.query('SELECT * FROM feature_flags WHERE name = $1', [flagName]);
      if (!flag.length) return false;
      
      if (flag[0].rollout_percentage === 100) return flag[0].enabled;
      if (flag[0].rollout_percentage === 0) return false;
      
      // Percentage-based rollout
      const hash = this.hashSiteId(siteId);
      return hash % 100 < flag[0].rollout_percentage;
    }
  }
  ```
- [ ] Create feature flag middleware
  ```javascript
  // middleware/featureFlags.js
  function checkFeatureFlag(flagName) {
    return async (req, res, next) => {
      const featureFlags = new FeatureFlagService();
      const enabled = await featureFlags.isEnabled(req.siteId, flagName);
      
      if (!enabled) {
        return res.status(404).send('Feature not available');
      }
      
      req.featureFlags = { [flagName]: true };
      next();
    };
  }
  ```
- [ ] Create feature flag API endpoints
  - [ ] List all feature flags: `GET /api/admin/feature-flags`
  - [ ] Create feature flag: `POST /api/admin/feature-flags`
  - [ ] Update feature flag: `PUT /api/admin/feature-flags/:id`
  - [ ] Enable for site: `POST /api/sites/:siteId/feature-flags/:flagId/enable`
  - [ ] Check site features: `GET /api/sites/:siteId/features`

#### Update Notification System
- [ ] Create update notifications table
  ```sql
  CREATE TABLE update_notifications (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    engine_version VARCHAR(20),
    message TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Create notification service
  ```javascript
  // services/notifications.js
  async function notifySiteOfUpdate(siteId, newVersion) {
    await db.query(
      'INSERT INTO update_notifications (site_id, engine_version, message) VALUES ($1, $2, $3)',
      [siteId, newVersion, `New engine version ${newVersion} is available`]
    );
  }
  ```
- [ ] Create background job to notify sites of new versions
- [ ] Create API endpoint to get notifications: `GET /api/sites/:siteId/notifications`

---

## Phase 5: Security & Performance

### 5.1 Security Implementation

#### Authentication & Authorization
- [ ] Implement user registration
  ```javascript
  // POST /api/auth/register
  async function register(req, res) {
    const { email, password, name } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING *',
      [email, hashedPassword, name]
    );
    res.json({ user: user[0] });
  }
  ```
- [ ] Implement user login with JWT
  ```javascript
  // POST /api/auth/login
  async function login(req, res) {
    const { email, password } = req.body;
    const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    
    if (!user.length) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const valid = await bcrypt.compare(password, user[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ userId: user[0].id }, process.env.JWT_SECRET);
    res.json({ token, user: user[0] });
  }
  ```
- [ ] Create authentication middleware
  ```javascript
  // middleware/auth.js
  function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  }
  ```
- [ ] Implement authorization checks (site ownership/membership)
- [ ] Add password reset functionality
- [ ] Implement email verification

#### Security Headers & CSP
- [ ] Configure Helmet with CSP
  ```javascript
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.cloudflare.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      }
    }
  }));
  ```
- [ ] Add CORS configuration
- [ ] Implement rate limiting per route
- [ ] Add request validation (express-validator)

#### Data Validation & Sanitization
- [ ] Install validation library (express-validator or joi)
- [ ] Create validation middleware for all inputs
- [ ] Sanitize user inputs
- [ ] Validate file uploads (if applicable)
- [ ] Implement SQL injection prevention (use parameterized queries)

### 5.2 Performance Optimization

#### Database Optimization
- [ ] Review and optimize all database queries
- [ ] Add database indexes for frequently queried columns
- [ ] Implement database connection pooling
  ```javascript
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  ```
- [ ] Set up query logging for slow queries
- [ ] Implement database query caching strategy

#### Caching Strategy
- [ ] Install Redis client
  ```bash
  npm install redis
  ```
- [ ] Set up Redis connection
- [ ] Implement caching middleware
  ```javascript
  // middleware/cache.js
  async function cacheMiddleware(ttl = 300) {
    return async (req, res, next) => {
      const key = `cache:${req.originalUrl}`;
      const cached = await redis.get(key);
      
      if (cached) {
        return res.json(JSON.parse(cached));
      }
      
      // Store original json method
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        redis.setex(key, ttl, JSON.stringify(data));
        return originalJson(data);
      };
      
      next();
    };
  }
  ```
- [ ] Cache site configurations
- [ ] Cache rendered pages (with invalidation)
- [ ] Implement cache invalidation on updates

#### Application Performance
- [ ] Implement response compression (gzip)
- [ ] Optimize JSON responses (remove unnecessary data)
- [ ] Implement pagination for list endpoints
- [ ] Add request/response logging
- [ ] Set up performance monitoring (New Relic, DataDog, or similar)

---

## Phase 6: Monitoring & Operations

### 6.1 Logging & Monitoring

#### Application Logging
- [ ] Set up structured logging (Winston or Pino)
  ```javascript
  const winston = require('winston');
  const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
      new winston.transports.File({ filename: 'error.log', level: 'error' }),
      new winston.transports.File({ filename: 'combined.log' })
    ]
  });
  ```
- [ ] Log all API requests
- [ ] Log errors with stack traces
- [ ] Log tenant context (site_id) in all logs
- [ ] Set up log rotation

#### Health Checks
- [ ] Create health check endpoint
  ```javascript
  // GET /health
  app.get('/health', async (req, res) => {
    const dbStatus = await checkDatabase();
    const redisStatus = await checkRedis();
    
    res.json({
      status: dbStatus && redisStatus ? 'healthy' : 'unhealthy',
      database: dbStatus ? 'connected' : 'disconnected',
      redis: redisStatus ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  });
  ```
- [ ] Set up uptime monitoring (UptimeRobot, Pingdom, etc.)
- [ ] Configure alerting for health check failures

#### Metrics & Analytics
- [ ] Set up application metrics collection
- [ ] Track key metrics:
  - [ ] Request rate per tenant
  - [ ] Response times
  - [ ] Error rates
  - [ ] Database query performance
  - [ ] SSL certificate status
- [ ] Create dashboard for monitoring (Grafana or similar)
- [ ] Set up alerting thresholds

### 6.2 Backup & Disaster Recovery

#### Database Backups
- [ ] Verify managed database automatic backups are configured
- [ ] Test backup restoration process
- [ ] Document backup retention policy
- [ ] Set up backup monitoring/alerts

#### Application Backups
- [ ] Create backup script for application data
- [ ] Set up automated backups for:
  - [ ] Site configurations
  - [ ] User uploads (if applicable)
  - [ ] SSL certificates
- [ ] Test disaster recovery procedure
- [ ] Document recovery procedures

### 6.3 Deployment Automation

#### CI/CD Setup
- [ ] Set up Git repository
- [ ] Configure CI/CD pipeline (GitHub Actions, GitLab CI, etc.)
- [ ] Create deployment script
  ```bash
  # deploy.sh
  #!/bin/bash
  git pull origin main
  npm install
  npm run build
  pm2 restart smartstore-api
  ```
- [ ] Set up automated testing in CI
- [ ] Configure deployment notifications

#### Environment Management
- [ ] Set up staging environment
- [ ] Configure environment-specific variables
- [ ] Create deployment checklist
- [ ] Document rollback procedures

---

## Phase 7: Testing & Documentation

### 7.1 Testing

#### Unit Tests
- [ ] Set up testing framework (Jest or Mocha)
- [ ] Write tests for:
  - [ ] Tenant resolution middleware
  - [ ] Domain routing logic
  - [ ] Database queries (with site_id enforcement)
  - [ ] Feature flag service
  - [ ] Engine rendering
- [ ] Achieve minimum 80% code coverage

#### Integration Tests
- [ ] Test API endpoints
- [ ] Test database operations
- [ ] Test SSL certificate provisioning
- [ ] Test domain verification flow
- [ ] Test engine migration process

#### End-to-End Tests
- [ ] Test complete site creation flow
- [ ] Test custom domain addition and verification
- [ ] Test site upgrade/migration
- [ ] Test multi-tenant isolation

### 7.2 Documentation

#### API Documentation
- [ ] Document all API endpoints (OpenAPI/Swagger)
- [ ] Include request/response examples
- [ ] Document authentication requirements
- [ ] Document error codes and messages

#### Developer Documentation
- [ ] Document architecture decisions
- [ ] Document database schema
- [ ] Document deployment process
- [ ] Create developer setup guide
- [ ] Document engine development process

#### User Documentation
- [ ] Create user guide for site management
- [ ] Document custom domain setup process
- [ ] Document SSL certificate management
- [ ] Create troubleshooting guide

---

## Phase 8: Launch Preparation

### 8.1 Pre-Launch Checklist

#### Security Audit
- [ ] Review all security headers
- [ ] Test for SQL injection vulnerabilities
- [ ] Test for XSS vulnerabilities
- [ ] Review authentication/authorization logic
- [ ] Perform penetration testing (optional but recommended)

#### Performance Testing
- [ ] Load testing (simulate multiple tenants)
- [ ] Stress testing (test system limits)
- [ ] Database performance testing
- [ ] SSL certificate performance impact

#### Legal & Compliance
- [ ] Privacy policy
- [ ] Terms of service
- [ ] GDPR compliance (if applicable)
- [ ] Data retention policies

### 8.2 Launch

#### Soft Launch
- [ ] Deploy to production
- [ ] Test with beta users
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Gather feedback

#### Public Launch
- [ ] Announce public availability
- [ ] Monitor system health
- [ ] Be ready for scaling if needed
- [ ] Have rollback plan ready

---

## Progress Tracking

### Overall Progress
- [ ] Phase 1: Foundation & Infrastructure (0/28 tasks)
- [ ] Phase 2: Database Schema & Multi-Tenancy (0/15 tasks)
- [ ] Phase 3: Backend Application Setup (0/25 tasks)
- [ ] Phase 4: Platform Update & Versioning (0/18 tasks)
- [ ] Phase 5: Security & Performance (0/20 tasks)
- [ ] Phase 6: Monitoring & Operations (0/15 tasks)
- [ ] Phase 7: Testing & Documentation (0/12 tasks)
- [ ] Phase 8: Launch Preparation (0/10 tasks)

**Total Tasks: 143**

---

## Notes

- Update this document as tasks are completed
- Add additional tasks as needed during implementation
- Review and adjust priorities based on project needs
- Document any deviations from the plan


