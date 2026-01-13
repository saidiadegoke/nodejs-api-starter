const router = require('express').Router();
const { requireAuth, requireRole } = require('../../shared/middleware/rbac.middleware');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');

const SiteController = require('./controllers/site.controller');
const TemplateController = require('./controllers/template.controller');
const PageController = require('./controllers/page.controller');
const CustomizationController = require('./controllers/customization.controller');
const PreviewController = require('./controllers/preview.controller');
const StatusController = require('./controllers/status.controller');
const EngineController = require('./controllers/engine.controller');
const CustomDomainController = require('./controllers/customDomain.controller');
const SSLController = require('./controllers/ssl.controller');
const DeploymentController = require('./controllers/deployment.controller');
const CertificateController = require('./controllers/certificate.controller');

/**
 * Sites Routes
 */
router.get('/', requireAuth, SiteController.getMySites);
router.get('/:siteId', requireAuth, SiteController.getSiteById);
router.get('/slug/:slug', requireAuth, SiteController.getSiteBySlug);
router.post(
  '/',
  requireAuth,
  [
    body('name').notEmpty().withMessage('Name is required'),
    body('slug').notEmpty().withMessage('Slug is required').matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase alphanumeric with hyphens'),
    validate,
  ],
  SiteController.createSite
);
router.put('/:siteId', requireAuth, SiteController.updateSite);
router.delete('/:siteId', requireAuth, SiteController.deleteSite);

/**
 * Status Routes (nested under sites)
 */
router.get('/:siteId/status', requireAuth, StatusController.getStatus);
router.put(
  '/:siteId/status',
  requireAuth,
  [
    body('status').isIn(['active', 'draft', 'suspended']).withMessage('Invalid status'),
    body('reason').optional().isString(),
    validate,
  ],
  StatusController.updateStatus
);
router.get('/:siteId/status/history', requireAuth, StatusController.getStatusHistory);

/**
 * Custom Domain Routes (nested under sites)
 */
router.get('/:siteId/custom-domains', requireAuth, CustomDomainController.getCustomDomains);
router.post(
  '/:siteId/custom-domains',
  requireAuth,
  [
    body('domain').notEmpty().withMessage('Domain is required'),
    validate,
  ],
  CustomDomainController.createCustomDomain
);
router.get('/:siteId/custom-domains/:domainId/status', requireAuth, CustomDomainController.getCustomDomainStatus);
router.post('/:siteId/custom-domains/:domainId/verify', requireAuth, CustomDomainController.verifyCustomDomain);
router.delete('/:siteId/custom-domains/:domainId', requireAuth, CustomDomainController.deleteCustomDomain);

/**
 * SSL Certificate Routes (nested under custom domains)
 */
router.get('/:siteId/custom-domains/:domainId/ssl/status', requireAuth, SSLController.getSSLStatus);
router.post('/:siteId/custom-domains/:domainId/ssl/provision', requireAuth, SSLController.provisionSSL);
router.post('/:siteId/custom-domains/:domainId/ssl/renew', requireAuth, SSLController.renewSSL);

/**
 * Deployment Routes (nested under sites)
 */
router.get('/:siteId/deployments', requireAuth, DeploymentController.getDeployments);
router.get('/:siteId/deployments/latest', requireAuth, DeploymentController.getLatestDeployment);
router.get('/:siteId/deployments/stats', requireAuth, DeploymentController.getDeploymentStats);
router.get('/:siteId/deployments/:deploymentId', requireAuth, DeploymentController.getDeploymentById);

/**
 * Templates Routes (nested under sites)
 */
router.get('/:siteId/templates', requireAuth, TemplateController.getSiteTemplate);
router.post(
  '/:siteId/templates',
  requireAuth,
  [
    body('templateId').notEmpty().isInt().withMessage('Template ID is required'),
    validate,
  ],
  TemplateController.applyTemplate
);

/**
 * Pages Routes (nested under sites)
 */
router.get('/:siteId/pages', requireAuth, PageController.getSitePages);
router.get('/:siteId/pages/:pageId', requireAuth, PageController.getPageById);
router.post(
  '/:siteId/pages',
  requireAuth,
  [
    body('title').notEmpty().withMessage('Title is required'),
    body('slug').notEmpty().withMessage('Slug is required'),
    validate,
  ],
  PageController.createPage
);
router.put('/:siteId/pages/:pageId', requireAuth, PageController.updatePage);
router.delete('/:siteId/pages/:pageId', requireAuth, PageController.deletePage);
router.get('/:siteId/pages/:pageId/versions', requireAuth, PageController.getPageVersions);

/**
 * Customization Routes (nested under sites)
 */
router.get('/:siteId/customization', requireAuth, CustomizationController.getCustomization);
router.put('/:siteId/customization', requireAuth, CustomizationController.updateCustomization);
router.post('/:siteId/customization/reset', requireAuth, CustomizationController.resetCustomization);

/**
 * Preview Routes (public, no auth required)
 * Unified preview system for components, templates, pages, and sites
 */
// Component preview
router.get('/preview/component/:componentId', PreviewController.previewComponent);
// Template preview
router.get('/preview/template/:templateId', PreviewController.previewTemplate);
// Page preview
router.get('/preview/page/:pageId', PreviewController.previewPage);
// Site preview (JSON config)
router.get('/preview/site/:siteId', PreviewController.previewSite);
// Legacy HTML endpoints (backward compatibility)
router.get('/preview/:siteId/html', PreviewController.previewSiteHTML);
router.get('/preview/:siteId/:pageId/html', PreviewController.previewPageHTML);

/**
 * Engine Version Routes (nested under sites)
 */
router.get('/:siteId/engine', requireAuth, EngineController.getEngineVersion);
router.get('/engine/versions', requireAuth, EngineController.getAvailableVersions);
router.get('/engine/versions/:version', requireAuth, EngineController.getVersionDetails);
router.post(
  '/:siteId/engine/update',
  requireAuth,
  [
    body('version').notEmpty().withMessage('Version is required'),
    validate,
  ],
  EngineController.updateEngineVersion
);
router.post(
  '/:siteId/engine/rollback',
  requireAuth,
  [
    body('version').optional().isString(),
    validate,
  ],
  EngineController.rollbackEngineVersion
);
router.get('/:siteId/engine/history', requireAuth, EngineController.getVersionHistory);

/**
 * Certificate Management Routes (admin only)
 * These routes manage SSL certificates and their domain assignments
 */
router.get('/admin/certificates', requireAuth, requireRole('admin'), CertificateController.getAllCertificates);
router.get('/admin/certificates/:certificateId', requireAuth, requireRole('admin'), CertificateController.getCertificateById);
router.post(
  '/admin/certificates',
  requireAuth,
  requireRole('admin'),
  [
    body('domains').optional().isArray().withMessage('Domains must be an array'),
    validate,
  ],
  CertificateController.createCertificate
);
router.post(
  '/admin/certificates/:certificateId/domains',
  requireAuth,
  requireRole('admin'),
  [
    body('customDomainId').notEmpty().isInt().withMessage('customDomainId is required'),
    body('domain').notEmpty().isString().withMessage('domain is required'),
    validate,
  ],
  CertificateController.assignDomain
);
router.delete(
  '/admin/certificates/:certificateId/domains',
  requireAuth,
  requireRole('admin'),
  [
    body('customDomainId').optional().isInt().withMessage('customDomainId must be an integer'),
    validate,
  ],
  CertificateController.removeDomain
);
router.delete('/admin/certificates/:certificateId', requireAuth, requireRole('admin'), CertificateController.deleteCertificate);

/**
 * Base Origin Certificate Routes (for smartstore.ng and *.smartstore.ng)
 */
router.get('/admin/certificates/base-origin', requireAuth, requireRole('admin'), CertificateController.getBaseOriginCertificate);
router.post('/admin/certificates/base-origin', requireAuth, requireRole('admin'), CertificateController.createBaseOriginCertificate);
router.post('/admin/certificates/base-origin/upload', requireAuth, requireRole('admin'), CertificateController.uploadBaseOriginCertificate);

module.exports = router;

