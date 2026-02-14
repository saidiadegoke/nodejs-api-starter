/**
 * Rate limiter for public form submit endpoint.
 * Limits requests per IP to reduce bot floods and abuse.
 * See docs/FORM_SUBMISSIONS_SERVICE_DESIGN.md § 6.1
 */
const rateLimit = require('express-rate-limit');

const windowMs = parseInt(process.env.FORM_SUBMIT_RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const max = parseInt(process.env.FORM_SUBMIT_RATE_LIMIT_MAX || '10', 10); // 10 per window

const formSubmitRateLimiter = rateLimit({
  windowMs,
  max,
  message: { success: false, message: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = formSubmitRateLimiter;
