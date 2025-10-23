/**
 * Standard success response
 */
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Standard error response
 */
const sendError = (res, message = 'An error occurred', statusCode = 500, details = null) => {
  const response = {
    success: false,
    message,
  };
  
  if (details) {
    response.details = details;
  }
  
  res.status(statusCode).json(response);
};

/**
 * Paginated response
 */
const sendPaginated = (res, data, page, limit, total) => {
  res.status(200).json({
    success: true,
    data,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

module.exports = { sendSuccess, sendError, sendPaginated };

