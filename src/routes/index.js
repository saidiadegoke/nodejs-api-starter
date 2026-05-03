const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const YAML = require('js-yaml');
const fs = require('fs');
const path = require('path');

const authRoutes = require('../modules/auth/routes');
const users = require('../modules/users/routes');
const filesRoutes = require('../modules/files/routes');
const notificationsRoutes = require('../modules/notifications/routes');
const sharedRoutes = require('../modules/shared/routes');
const websocketRoutes = require('../modules/websocket/routes');
const assetsRoutes = require('../modules/assets/routes');
const adminRoutes = require('../modules/admin/routes');
const apiKeysRoutes = require('../modules/api-keys/routes');
const webhooksRoutes = require('../modules/webhooks/routes');
const paymentsRoutes = require('../modules/payments/routes');
const postsRoutes = require('../modules/posts/routes');
const jupebRoutes = require('../modules/jupeb/routes');
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
      jupeb009InstitutionScope: '/docs/jupeb-009-institution-scope'
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
      catalog: '/catalog',
      sessions: '/sessions',
      identity: '/identity',
      submission: '/submission',
      registration: '/registration',
      finance: '/finance',
      academic: '/academic',
      health: '/health'
    },
    features: {
      authentication: 'JWT (access + refresh tokens)',
      authorization: 'RBAC (multiple roles per user)',
      file_storage: 'Centralized with multi-provider support',
      real_time: 'WebSocket support enabled',
      payments: 'Paystack, Flutterwave, direct bank transfer, webhooks',
      posts: 'User-authored posts with draft / published workflow'
    }
  });
});

/**
 * Module routes
 * JUPEB feature routes (catalog, sessions, registration, etc.) are mounted at `/` so paths are
 * e.g. `/catalog`, `/registration` — they must be registered before `/admin` so `PATCH /admin/users/.../jupeb-university` is handled here.
 */
router.use('/', jupebRoutes);
router.use('/auth', authRoutes);
router.use('/users', users);
router.use('/files', filesRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/shared', sharedRoutes);
router.use('/websocket', websocketRoutes);
router.use('/assets', assetsRoutes);
router.use('/admin', adminRoutes);
router.use('/api-keys', apiKeysRoutes);
router.use('/webhooks', webhooksRoutes);
router.use('/payments', paymentsRoutes);
router.use('/posts', postsRoutes);

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
  'jupeb-009-institution-scope': YAML.load(
    fs.readFileSync(path.join(docsDir, 'jupeb-009-institution-scope-swagger.yaml'), 'utf8')
  )
};

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
    .container { max-width: 860px; margin: 0 auto; padding: 48px 24px; }
    h1 { color: #1a1a2e; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 36px; font-size: 15px; }
    .api-card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 16px; transition: box-shadow 0.15s; }
    .api-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .api-title { font-size: 17px; font-weight: 600; color: #1a1a2e; margin-bottom: 6px; }
    .api-desc { color: #555; font-size: 14px; line-height: 1.6; margin-bottom: 16px; white-space: pre-line; }
    .api-links { display: flex; gap: 10px; }
    .btn { padding: 8px 18px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; transition: opacity 0.15s; }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-secondary { background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1; }
    .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>API Documentation</h1>
    <p class="subtitle">Select a module to explore its endpoints and schemas.</p>
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
    <div class="footer">API v1.0.0 &nbsp;|&nbsp; Swagger UI</div>
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
