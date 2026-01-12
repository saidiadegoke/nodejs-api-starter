const router = require('express').Router();
const SiteRendererService = require('../services/siteRenderer.service');
const { logger } = require('../../../shared/utils/logger');

/**
 * Public Routes for Site Rendering
 * These routes are accessed via subdomain or custom domain
 * The siteRouter middleware should attach req.site before these routes
 */

/**
 * Homepage route
 */
router.get('/', async (req, res) => {
  try {
    const site = req.site;
    
    if (!site) {
      return res.status(404).send('Site not found');
    }

    // Only active sites can be rendered
    if (site.status !== 'active') {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Site Not Available</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>Site Not Available</h1>
          <p>This site is currently in draft mode and not yet published.</p>
        </body>
        </html>
      `);
    }

    // Active site must have a template
    if (!site.template_id) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Site Configuration Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1>500 - Site Configuration Error</h1>
          <p>This site has no template configured.</p>
        </body>
        </html>
      `);
    }

    // Render site homepage
    const html = await SiteRendererService.renderSite(site);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Homepage rendering error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #d32f2f; }
        </style>
      </head>
      <body>
        <h1>500 - Server Error</h1>
        <p>An error occurred while rendering the site.</p>
      </body>
      </html>
    `);
  }
});

/**
 * Page route (catch-all for pages)
 */
router.get('/:pageSlug', async (req, res) => {
  try {
    const site = req.site;
    const { pageSlug } = req.params;
    
    if (!site) {
      return res.status(404).send('Site not found');
    }

    // Only active sites can be rendered
    if (site.status !== 'active') {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Site Not Available</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>Site Not Available</h1>
          <p>This site is currently in draft mode and not yet published.</p>
        </body>
        </html>
      `);
    }

    // Active site must have a template
    if (!site.template_id) {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Site Configuration Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1>500 - Site Configuration Error</h1>
          <p>This site has no template configured.</p>
        </body>
        </html>
      `);
    }

    const TemplateModel = require('../models/template.model');
    const template = await TemplateModel.getTemplateById(site.template_id);
    if (!template) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Template Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #d32f2f; }
          </style>
        </head>
        <body>
          <h1>500 - Template Not Found</h1>
          <p>The template for this site could not be found.</p>
        </body>
        </html>
      `);
    }

    // Parse template config to get pages
    const templateConfig = typeof template.config === 'string' 
      ? JSON.parse(template.config) 
      : template.config;
    
    const pages = templateConfig?.pages || [];
    const page = pages.find(p => p.slug === pageSlug);
    
    if (!page) {
      // Page not found - render 404
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The page you're looking for doesn't exist.</p>
          <a href="/">Go to Homepage</a>
        </body>
        </html>
      `);
    }

    // Check if page is published (only for non-draft sites)
    if (site.status === 'active' && page.published !== true && page.status !== 'published') {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Page Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #333; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>This page is not published.</p>
          <a href="/">Go to Homepage</a>
        </body>
        </html>
      `);
    }

    // Render page
    const html = await SiteRendererService.renderPage(site, pageSlug);
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (error) {
    logger.error('Page rendering error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Server Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #d32f2f; }
        </style>
      </head>
      <body>
        <h1>500 - Server Error</h1>
        <p>An error occurred while rendering the page.</p>
      </body>
      </html>
    `);
  }
});

module.exports = router;


