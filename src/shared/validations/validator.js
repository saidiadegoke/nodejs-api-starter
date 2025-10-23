const { validationResult } = require('express-validator');
const { sendError } = require('../utils/response');
const { UNPROCESSABLE_ENTITY } = require('../constants/statusCodes');

/**
 * Validation middleware to check express-validator results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return sendError(
      res,
      'Validation failed',
      UNPROCESSABLE_ENTITY,
      errors.array()
    );
  }
  
  next();
};

module.exports = { validate };

