const AdminErrorLogModel = require('../../modules/admin/models/adminErrorLog.model');
const { logger } = require('../utils/logger');
const pool = require('../../db/pool');

const SLOW_THRESHOLD_MS = 3000;

/**
 * Request logging + traffic counters.
 * - Every request increments hourly bucket counters in `request_counters`
 * - Only errors (4xx/5xx) and slow requests (>= 3s) are persisted to `request_logs` with full payload
 *
 * Mount after body parsers and request-ID middleware in app.js.
 */
function requestLogMiddleware(req, res, next) {
  const startTime = Date.now();

  // Capture response body for error diagnostics
  const originalJson = res.json.bind(res);
  let responseBody = null;
  res.json = function (body) {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isError = statusCode >= 400;
    const isSlow = durationMs >= SLOW_THRESHOLD_MS;

    pool.query(
      `INSERT INTO request_counters (bucket, total_requests, success_requests, error_requests, slow_requests)
       VALUES (date_trunc('hour', NOW()), 1, $1, $2, $3)
       ON CONFLICT (bucket) DO UPDATE SET
         total_requests = request_counters.total_requests + 1,
         success_requests = request_counters.success_requests + $1,
         error_requests = request_counters.error_requests + $2,
         slow_requests = request_counters.slow_requests + $3`,
      [isError ? 0 : 1, isError ? 1 : 0, isSlow ? 1 : 0]
    ).catch((err) => {
      logger.error('Failed to increment request counter:', err.message);
    });

    if (!isError && !isSlow) return;

    // Redact sensitive fields before persisting the body
    let sanitizedBody = null;
    if (req.body && Object.keys(req.body).length > 0) {
      sanitizedBody = { ...req.body };
      const sensitive = ['password', 'token', 'secret', 'api_key', 'apiKey', 'authorization'];
      for (const key of sensitive) {
        if (key in sanitizedBody) sanitizedBody[key] = '[REDACTED]';
      }
    }

    const entry = {
      method: req.method,
      path: req.originalUrl || req.path,
      statusCode,
      durationMs,
      requestId: req.id,
      userId: req.user?.user_id || null,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
      requestBody: sanitizedBody,
      requestQuery: Object.keys(req.query || {}).length > 0 ? req.query : null,
      responseBody,
      errorMessage: responseBody?.message || null,
      errorStack: null,
    };

    AdminErrorLogModel.insert(entry).catch((err) => {
      logger.error('Failed to insert request log:', err.message);
    });
  });

  next();
}

module.exports = { requestLogMiddleware };
