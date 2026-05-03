const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { errorHandler, notFoundHandler } = require('./shared/middleware/error.middleware');
const { requestLogMiddleware } = require('./shared/middleware/requestLog.middleware');
const { logger } = require('./shared/utils/logger');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : ['http://localhost:3000', 'http://localhost:4070']; // Default

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    
    // Check exact match in allowed origins
    if (allowedOrigins.indexOf(origin) !== -1) {
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

// Structured request logging for dashboards (method, path, statusCode, durationMs, requestId)
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

// DB-backed request logging: increments hourly counters on every request,
// persists full log entries for errors (>= 400) and slow (>= 3s) requests.
// Browsable via GET /admin/error-logs (admin only).
app.use(requestLogMiddleware);

// API routes
app.use('/', routes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

if (process.env.NODE_ENV !== 'test') {
  // eslint-disable-next-line global-require
  require('./modules/jupeb/jobs/nin-resolver.job').start();
}

module.exports = app;


