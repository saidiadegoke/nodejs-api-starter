const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');
const fs = require('fs');
const path = require('path');

const filesRoutes = require('../modules/files/routes');
const notificationsRoutes = require('../modules/notifications/routes');
const sharedRoutes = require('../modules/shared/routes');
const websocketRoutes = require('../modules/websocket/routes');
const assetsRoutes = require('../modules/assets/routes');
const adminRoutes = require('../modules/admin/routes');
const webhooksRoutes = require('../modules/webhooks/routes');
const paymentsRoutes = require('../modules/payments/routes');
const postsRoutes = require('../modules/posts/routes');
const jupebRoutes = require('../modules/jupeb/routes');
const ocrRoutes = require('../modules/ocr/routes');
const attendanceRoutes = require('../modules/attendance/routes');
const crmsRoutes = require('../modules/crms/routes');
const supportRoutes = require('../modules/support/routes/support.routes');
const auditRoutes = require('../modules/admin/audit.routes');
const testRoutes = require('./test-routes');

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * API version info
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API v1.0',
    version: '1.0.0',
    documentation: {
      index: '/docs',
      auth: '/docs/auth',
      users: '/docs/users',
      files: '/docs/files',
      notifications: '/docs/notifications',
      assets: '/docs/assets',
      shared: '/docs/shared',
      websocket: '/docs/websocket',
      admin: '/docs/admin',
      apiKeys: '/docs/api-keys',
      webhooks: '/docs/webhooks',
      payments: '/docs/payments',
      posts: '/docs/posts',
      jupeb001Catalog: '/docs/jupeb-001-catalog',
      jupeb002Sessions: '/docs/jupeb-002-sessions',
      jupeb003Identity: '/docs/jupeb-003-identity',
      jupeb004Submission: '/docs/jupeb-004-submission',
      jupeb005Registration: '/docs/jupeb-005-registration',
      jupeb006Finance: '/docs/jupeb-006-finance',
      jupeb007Academic: '/docs/jupeb-007-academic',
      jupeb008Dashboard: '/docs/jupeb-008-dashboard',
      jupeb009InstitutionScope: '/docs/jupeb-009-institution-scope',
      ocr: '/docs/ocr',
      sso: '/docs/sso',
      attendanceUpstream: '/docs/attendance-upstream',
      crmsUpstream: '/docs/crms-upstream'
    },
    endpoints: {
      auth: '/auth',
      users: '/users',
      files: '/files',
      notifications: '/notifications',
      websocket: '/websocket',
      assets: '/assets',
      shared: '/shared',
      admin: '/admin',
      apiKeys: '/api-keys',
      webhooks: '/webhooks',
      payments: '/payments',
      posts: '/posts',
      ocr: '/ocr',
      catalog: '/catalog',
      sessions: '/sessions',
      identity: '/identity',
      submission: '/submission',
      registration: '/registration',
      finance: '/finance',
      academic: '/academic',
      dashboard: '/dashboard',
      attendance: '/attendance',
      support: '/support',
      audit: '/audit',
      sso: '/sso',
      jwks: '/.well-known/jwks.json',
      health: '/health'
    },
    features: {
      authentication: 'JWT (access + refresh tokens)',
      authorization: 'RBAC (multiple roles per user)',
      file_storage: 'Centralized with multi-provider support',
      real_time: 'WebSocket support enabled',
      payments: 'Paystack, Flutterwave, direct bank transfer, webhooks',
      posts: 'User-authored posts with draft / published workflow',
      sso: 'RS256 handoff tokens for CRMS / Attendance (JWKS issuer)'
    }
  });
});

/**
 * Module routes
 * JUPEB feature routes (catalog, sessions, registration, etc.) are mounted at `/` so paths are
 * e.g. `/catalog`, `/registration` — they must be registered before `/admin` so `PATCH /admin/users/.../jupeb-university` is handled here.
 */
router.use('/', jupebRoutes);
router.use('/files', filesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/crms', crmsRoutes);
router.use('/shared', sharedRoutes);
router.use('/websocket', websocketRoutes);
router.use('/assets', assetsRoutes);
router.use('/audit', auditRoutes);
router.use('/admin', adminRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/payments', paymentsRoutes);
router.use('/posts', postsRoutes);
router.use('/ocr', ocrRoutes);
router.use('/support', supportRoutes);

/**
 * Swagger API Documentation
 *
 * Optional basic-auth: set API_DOCS_PASSWORD in env to password-protect /docs.
 * Leave unset for open access.
 */
const docsAuth = (req, res, next) => {
  const password = process.env.API_DOCS_PASSWORD;
  if (!password) return next();

  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Basic ')) {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
    const [, pass] = decoded.split(':');
    if (pass === password) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="API Documentation"');
  return res.status(401).send('Authentication required');
};

router.use('/docs', docsAuth);

const docsDir = path.join(__dirname, '../../docs');
const swaggerDocs = {
  auth: YAML.load(fs.readFileSync(path.join(docsDir, 'auth-swagger.yaml'), 'utf8')),
  users: YAML.load(fs.readFileSync(path.join(docsDir, 'users-swagger.yaml'), 'utf8')),
  files: YAML.load(fs.readFileSync(path.join(docsDir, 'files-swagger.yaml'), 'utf8')),
  notifications: YAML.load(fs.readFileSync(path.join(docsDir, 'notifications-swagger.yaml'), 'utf8')),
  assets: YAML.load(fs.readFileSync(path.join(docsDir, 'assets-swagger.yaml'), 'utf8')),
  shared: YAML.load(fs.readFileSync(path.join(docsDir, 'shared-swagger.yaml'), 'utf8')),
  websocket: YAML.load(fs.readFileSync(path.join(docsDir, 'websocket-swagger.yaml'), 'utf8')),
  admin: YAML.load(fs.readFileSync(path.join(docsDir, 'admin-swagger.yaml'), 'utf8')),
  'api-keys': YAML.load(fs.readFileSync(path.join(docsDir, 'api-keys-swagger.yaml'), 'utf8')),
  webhooks: YAML.load(fs.readFileSync(path.join(docsDir, 'webhooks-swagger.yaml'), 'utf8')),
  payments: YAML.load(fs.readFileSync(path.join(docsDir, 'payments-swagger.yaml'), 'utf8')),
  posts: YAML.load(fs.readFileSync(path.join(docsDir, 'posts-swagger.yaml'), 'utf8')),
  'jupeb-001-catalog': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-001-catalog-swagger.yaml'), 'utf8')),
  'jupeb-002-sessions': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-002-sessions-swagger.yaml'), 'utf8')),
  'jupeb-003-identity': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-003-identity-swagger.yaml'), 'utf8')),
  'jupeb-004-submission': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-004-submission-swagger.yaml'), 'utf8')),
  'jupeb-005-registration': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-005-registration-swagger.yaml'), 'utf8')),
  'jupeb-006-finance': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-006-finance-swagger.yaml'), 'utf8')),
  'jupeb-007-academic': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-007-academic-swagger.yaml'), 'utf8')),
  'jupeb-008-dashboard': YAML.load(fs.readFileSync(path.join(docsDir, 'jupeb-008-dashboard-swagger.yaml'), 'utf8')),
  'jupeb-009-institution-scope': YAML.load(
    fs.readFileSync(path.join(docsDir, 'jupeb-009-institution-scope-swagger.yaml'), 'utf8')
  ),
  ocr: YAML.load(fs.readFileSync(path.join(docsDir, 'ocr-swagger.yaml'), 'utf8')),
  support: YAML.load(fs.readFileSync(path.join(docsDir, 'support-swagger.yaml'), 'utf8')),
  attendance: YAML.load(fs.readFileSync(path.join(docsDir, 'attendance-swagger.yaml'), 'utf8')),
  crms: YAML.load(fs.readFileSync(path.join(docsDir, 'crms-swagger.yaml'), 'utf8')),
};

// Mount each modular swagger spec
Object.keys(swaggerDocs).forEach((key) => {
  router.use(
    `/docs/${key}`,
    swaggerUi.serveFiles(swaggerDocs[key], {}),
    swaggerUi.setup(swaggerDocs[key], {
      customSiteTitle: `API — ${swaggerDocs[key].info.title}`,
      customCss: '.swagger-ui .topbar { display: none }'
    })
  );
  router.get(`/docs/${key}.json`, (req, res) => res.json(swaggerDocs[key]));
});

// Unified OpenAPI endpoints for Postman and Swagger
const unifiedJsonPath = path.join(docsDir, 'openapi.json');
const unifiedYamlPath = path.join(docsDir, 'openapi.yaml');

if (fs.existsSync(unifiedJsonPath)) {
  const unifiedSpec = JSON.parse(fs.readFileSync(unifiedJsonPath, 'utf8'));
  router.use(
    '/docs/all',
    swaggerUi.serveFiles(unifiedSpec, {}),
    swaggerUi.setup(unifiedSpec, {
      customSiteTitle: 'API — Complete Unified Specification (Postman Ready)',
      customCss: '.swagger-ui .topbar { display: none }'
    })
  );
}

router.get('/docs/openapi.json', (req, res) => {
  if (fs.existsSync(unifiedJsonPath)) {
    return res.sendFile(unifiedJsonPath);
  }
  return res.status(404).json({ error: 'Unified OpenAPI specification not yet generated' });
});

router.get('/docs/openapi.yaml', (req, res) => {
  if (fs.existsSync(unifiedYamlPath)) {
    return res.sendFile(unifiedYamlPath);
  }
  return res.status(404).send('Unified OpenAPI specification not yet generated');
});

router.get('/docs', (req, res) => {
  const apiList = Object.keys(swaggerDocs).map((key) => ({
    name: swaggerDocs[key].info.title,
    description: swaggerDocs[key].info.description,
    url: `/docs/${key}`,
    jsonUrl: `/docs/${key}.json`
  }));

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>API Documentation</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; background: #f0f2f5; }
    .container { max-width: 900px; margin: 0 auto; padding: 48px 24px; }
    h1 { color: #1a1a2e; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 30px; font-size: 15px; }
    .hero-card { background: linear-gradient(135deg, #1e293b, #0f172a); border-radius: 12px; padding: 28px; margin-bottom: 28px; color: white; box-shadow: 0 10px 25px rgba(0,0,0,0.15); }
    .hero-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .hero-desc { color: #cbd5e1; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
    .api-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 16px; transition: box-shadow 0.15s; }
    .api-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .api-title { font-size: 17px; font-weight: 600; color: #1a1a2e; margin-bottom: 6px; }
    .api-desc { color: #555; font-size: 14px; line-height: 1.6; margin-bottom: 16px; white-space: pre-line; }
    .api-links { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn { padding: 8px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; transition: opacity 0.15s; display: inline-flex; align-items: center; }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .btn-hero { background: #3b82f6; color: white; font-weight: 600; }
    .btn-hero-alt { background: rgba(255,255,255,0.12); color: white; border: 1px solid rgba(255,255,255,0.25); }
    .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 13px; }
    .badge { background: #10b981; color: white; font-size: 11px; padding: 2px 8px; border-radius: 9999px; text-transform: uppercase; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <h1>API Documentation</h1>
    <p class="subtitle">Complete technical reference for the JUPEB Registration & Administration Portal.</p>

    <div class="hero-card">
      <div class="hero-title">
        <span>Unified OpenAPI 3.0 Specification</span>
        <span class="badge">Postman Ready</span>
      </div>
      <div class="hero-desc">
        Import the complete API catalog directly into Postman or Insomnia. Contains all 255+ endpoints across 49 categories with authentication, schemas, parameters, and examples.
      </div>
      <div class="api-links">
        <a href="/docs/all" class="btn btn-hero">Explore All Endpoints</a>
        <a href="/docs/openapi.json" download="openapi.json" class="btn btn-hero-alt">Download openapi.json (Postman)</a>
        <a href="/docs/openapi.yaml" download="openapi.yaml" class="btn btn-hero-alt">Download openapi.yaml</a>
      </div>
    </div>

    <h2 style="font-size: 18px; color: #334155; margin-bottom: 16px;">Individual Modules</h2>
    ${apiList
      .map(
        (api) => `
    <div class="api-card">
      <div class="api-title">${api.name}</div>
      <div class="api-desc">${api.description || ''}</div>
      <div class="api-links">
        <a href="${api.url}" class="btn btn-primary">View Docs</a>
        <a href="${api.jsonUrl}" class="btn btn-secondary">Download JSON</a>
      </div>
    </div>`
      )
      .join('')}
    <div class="footer">JUPEB Portal API v1.0.0 &nbsp;|&nbsp; OpenAPI 3.0 &nbsp;|&nbsp; Swagger UI</div>
  </div>
</body>
</html>`);
});

/**
 * Test routes (for RBAC testing)
 * Only include in development/test environments
 */
if (process.env.NODE_ENV !== 'production') {
  router.use('/', testRoutes);
}

module.exports = router;
