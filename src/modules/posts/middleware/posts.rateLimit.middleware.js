const { rateLimit } = require('express-rate-limit');

function key(req) {
  return req.user?.user_id || req.ip || 'unknown';
}

const windowMs = parseInt(process.env.POST_RATE_LIMIT_WINDOW_MS || '60000', 10);

const postReadLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.POST_READ_RATE_LIMIT_MAX || '120', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: key,
});

const postWriteLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.POST_WRITE_RATE_LIMIT_MAX || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: key,
});

const postCommentLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.POST_COMMENT_RATE_LIMIT_MAX || '25', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: key,
});

const postLikeLimiter = rateLimit({
  windowMs,
  max: parseInt(process.env.POST_LIKE_RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: key,
});

module.exports = {
  postReadLimiter,
  postWriteLimiter,
  postCommentLimiter,
  postLikeLimiter,
};
