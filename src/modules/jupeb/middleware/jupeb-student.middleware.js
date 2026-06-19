const { requireAuth, requirePermission, requireRole } = require('../../../shared/middleware/rbac.middleware');

/**
 * Student-facing JUPEB routes (registration claim, finance checkout, submissions).
 * When `JUPEB_STUDENT_ROUTES_STRICT=true`, only `student` and `user` roles may access
 * (no admin bypass via permissions). Default: permission-based via `jupeb.student.access`
 * which admin/super_admin inherit automatically.
 */
function jupebStudentMiddleware() {
  const strict = String(process.env.JUPEB_STUDENT_ROUTES_STRICT || '').toLowerCase() === 'true';
  if (strict) {
    return [requireAuth, requireRole('student', 'user')];
  }
  return [requireAuth, requirePermission('jupeb.student.access')];
}

module.exports = {
  jupebStudentMiddleware,
};
