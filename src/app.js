const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./shared/middleware/error.middleware');
const { logger } = require('./shared/utils/logger');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['https://api.smartstore.ng']; // Default

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    return callback(null, origin);
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

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
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


