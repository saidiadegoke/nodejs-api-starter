const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./shared/middleware/error.middleware');
const { logger } = require('./shared/utils/logger');
const pool = require('./db/pool');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['https://api.smartstore.ng', 'https://smartstore.ng', 'https://app.smartstore.ng']; // Default

// Base domains that support wildcard subdomains
const baseDomain = process.env.BASE_DOMAIN || 'smartstore.ng';

// Cache for verified custom domains (refreshed periodically)
let verifiedCustomDomainsCache = new Set();
let customDomainsCacheTimestamp = 0;
const CUSTOM_DOMAINS_CACHE_TTL = 60000; // 1 minute

/**
 * Get all verified custom domains from database
 * Uses cache to avoid frequent database queries
 */
async function getVerifiedCustomDomains() {
  const now = Date.now();
  
  // Return cached data if still valid
  if (now - customDomainsCacheTimestamp < CUSTOM_DOMAINS_CACHE_TTL && verifiedCustomDomainsCache.size > 0) {
    return verifiedCustomDomainsCache;
  }
  
  try {
    // Query database for all verified custom domains
    const result = await pool.query(
      'SELECT domain FROM custom_domains WHERE verified = true',
      []
    );
    
    // Update cache
    verifiedCustomDomainsCache = new Set();
    result.rows.forEach(row => {
      // Normalize domain (remove www, lowercase, add both http and https)
      const domain = row.domain.toLowerCase().replace(/^www\./, '');
      verifiedCustomDomainsCache.add(`https://${domain}`);
      verifiedCustomDomainsCache.add(`http://${domain}`);
      // Also add www variant
      verifiedCustomDomainsCache.add(`https://www.${domain}`);
      verifiedCustomDomainsCache.add(`http://www.${domain}`);
    });
    
    customDomainsCacheTimestamp = now;
    logger.debug(`[CORS] Loaded ${result.rows.length} verified custom domains into cache`);
    
    return verifiedCustomDomainsCache;
  } catch (error) {
    logger.error('[CORS] Error loading verified custom domains:', error);
    // Return existing cache on error (fail open)
    return verifiedCustomDomainsCache;
  }
}

app.use(cors({
  origin: async function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Check exact match in allowed origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, origin);
    }
    
    // Check wildcard subdomain match (e.g., *.smartstore.ng)
    const originUrl = new URL(origin);
    const originHostname = originUrl.hostname.toLowerCase();
    
    // Check if origin is a subdomain of base domain
    if (originHostname === baseDomain || originHostname.endsWith(`.${baseDomain}`)) {
      return callback(null, origin);
    }
    
    // Check if origin is a verified custom domain
    const verifiedDomains = await getVerifiedCustomDomains();
    if (verifiedDomains.has(origin)) {
      return callback(null, origin);
    }
    
    // Normalize origin (remove www) and check again
    const normalizedOrigin = origin.replace(/\/\/www\./, '//');
    if (verifiedDomains.has(normalizedOrigin)) {
      return callback(null, origin);
    }
    
    // If not matched, reject
    const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'client-type', 'Accept']
}));

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Passport for OAuth
const passport = require('./shared/config/passport.config');
app.use(passport.initialize());

// Request ID for correlating logs (dashboard / monitoring)
const crypto = require('crypto');
app.use((req, res, next) => {
  req.id = req.get('x-request-id') || crypto.randomBytes(8).toString('hex');
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Request logging middleware (structured for dashboards: method, path, statusCode, durationMs, requestId)
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    logger.request({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs,
      requestId: req.id,
    });
  });
  next();
});

// Multi-tenant routing middleware (for site rendering)
// This should come before API routes to catch subdomain/custom domain requests
const hostnameExtractor = require('./modules/sites/middleware/hostnameExtractor');
const siteRouter = require('./modules/sites/middleware/siteRouter');
const publicRoutes = require('./modules/sites/routes/public.routes');

// Apply multi-tenant routing only if not an API request
app.use((req, res, next) => {
  // Get hostname from request
  const hostname = req.hostname || req.get('host') || req.headers.host || '';
  const cleanHostname = hostname.split(':')[0].toLowerCase();
  
  // Skip multi-tenant routing for:
  // 1. API hostname (localhost, api.smartstore.ng, etc.)
  // 2. API paths that should always go to API routes
  const apiHostnames = ['localhost', '127.0.0.1', 'api.smartstore.ng', 'api.smartstore.ng.ng'];
  const apiPaths = ['/api', '/v1', '/auth', '/health'];
  const isApiHostname = apiHostnames.some(h => cleanHostname === h || cleanHostname.includes(h));
  const isApiPath = apiPaths.some(path => req.path.startsWith(path));
  
  // If it's an API hostname or API path, skip multi-tenant routing
  if (isApiHostname || isApiPath) {
    return next();
  }
  
  // Apply hostname extraction and site routing for subdomain/custom domain requests
  hostnameExtractor(req, res, () => {
    siteRouter(req, res, () => {
      // If site is found, use public routes
      if (req.site) {
        return publicRoutes(req, res, next);
      }
      // Otherwise continue to API routes (fallback)
      next();
    });
  });
});

// API routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;


