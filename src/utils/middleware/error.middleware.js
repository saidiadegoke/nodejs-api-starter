const { logger } = require('../utils/logger');
const { sendError } = require('../utils/response');
const { INTERNAL_SERVER_ERROR } = require('../constants/statusCodes');

/**
 * Global error handler middleware
 * Logs structured error for dashboards (message, stack, path, method, requestId, statusCode).
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || INTERNAL_SERVER_ERROR;
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req?.path,
    method: req?.method,
    requestId: req?.id,
    statusCode,
  });

  const message = err.message || 'Internal Server Error';
  sendError(res, message, statusCode, err.details);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  sendError(res, `Route ${req.method} ${req.path} not found`, 404);
};

module.exports = { errorHandler, notFoundHandler };


