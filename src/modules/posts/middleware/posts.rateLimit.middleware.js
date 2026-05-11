const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// express-rate-limit v8 requires custom keyGenerators that fall back to the
// request IP to route IP-derived keys through `ipKeyGenerator` so IPv6 keys
// are masked to a /64 prefix (otherwise an attacker can rotate the suffix
// and bypass per-IP limits). Authenticated requests still key on user_id.
function key(req) {
  if (req.user?.user_id) return req.user.user_id;
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
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
