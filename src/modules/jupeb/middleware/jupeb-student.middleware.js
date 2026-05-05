const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');

/**
 * Student-facing JUPEB routes (registration claim, finance checkout, submissions).
 * When `JUPEB_STUDENT_ROUTES_STRICT=true`, only `student` and `user` may access (no admin bypass).
 * Default (unset/false): also allows `admin` and `super_admin` for support and integration tests.
 */
function jupebStudentMiddleware() {
  const strict = String(process.env.JUPEB_STUDENT_ROUTES_STRICT || '').toLowerCase() === 'true';
  const roles = strict ? ['student', 'user'] : ['student', 'user', 'admin', 'super_admin'];
  return [requireAuth, requireRole(...roles)];
}

module.exports = {
  jupebStudentMiddleware,
};
