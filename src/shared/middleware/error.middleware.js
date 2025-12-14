const { logger } = require('../utils/logger');
const { sendError } = require('../utils/response');
const { INTERNAL_SERVER_ERROR } = require('../constants/statusCodes');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || INTERNAL_SERVER_ERROR;
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


