const SiteLookupService = require('../services/siteLookup.service');
const { logger } = require('../../../shared/utils/logger');

/**
 * Site Router Middleware
 * Looks up site by hostname and attaches to request
 * Also checks site status
 */
const siteRouter = async (req, res, next) => {
  try {
    const hostname = req.hostname;
    
    if (!hostname) {
      return res.status(400).send('Hostname is required');
    }

    // Lookup site
    const site = await SiteLookupService.getSiteByHostname(hostname);
    
    if (!site) {
      // Site not found - render 404
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Site Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>404 - Site Not Found</h1>
          <p>The site you're looking for doesn't exist.</p>
        </body>
        </html>
      `);
    }
    
    // Attach site to request
    req.site = site;
    
    // Check site status
    if (site.status === 'suspended') {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Site Suspended</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #d32f2f; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>Site Suspended</h1>
          <p>This site has been suspended. Please contact support for more information.</p>
        </body>
        </html>
      `);
    }
    
    if (site.status === 'draft') {
      // Check if user is authenticated and is the owner
      // For now, we'll allow preview via special header or query param
      // In production, this should check authentication properly
      const isOwner = req.user && req.user.user_id === site.owner_id;
      const isPreview = req.query.preview === 'true' || req.headers['x-preview-mode'] === 'true';
      
      if (!isOwner && !isPreview) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Site in Draft Mode</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #f57c00; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <h1>Site in Draft Mode</h1>
            <p>This site is not yet published. Only the owner can preview it.</p>
          </body>
          </html>
        `);
      }
      
      // Mark as draft preview
      req.isDraftPreview = true;
    }
    
    // Site is active or user has permission - continue
    next();
  } catch (error) {
    logger.error('Site routing error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #d32f2f; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <h1>500 - Server Error</h1>
        <p>An error occurred while processing your request.</p>
      </body>
      </html>
    `);
  }
};

module.exports = siteRouter;


