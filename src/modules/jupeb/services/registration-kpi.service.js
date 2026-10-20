/**
 * Shared registration KPI counts for institution overview stats and the
 * program dashboard stat-cards — single SQL definition to avoid drift.
 */
const pool = require('../../../database/pool');

const PENDING_STATUSES = [
  'provisional',
  'code_issued',
  'claimed',
  'pending_student_confirm',
  'pending_documents',
  'pending_institution_review',
];

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function assertUuid(value, label) {
  if (value && !isUuid(value)) throw httpError(422, `${label} must be a valid UUID`);
}

/**
 * Percent change vs a prior period count.
 * - `previous == null|undefined` → no comparison → `null`.
 * - `previous === 0` and `current === 0` → `0`.
 * - `previous === 0` and `current > 0` → **`100`** (conventional “new activity vs zero baseline”
 *   so the UI can show a positive bar; not a mathematical limit).
 * - Otherwise → `((current - previous) / previous) * 100`, rounded to 2 decimals.
 */
function deltaPct(current, previous) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : 100;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

/**
 * Direction of change vs the comparison session (for UI coloring / copy).
 * `new` = baseline was 0 and current is positive (delta_pct uses 100 as convention).
 * `null` = no comparison row (no previous session).
 * @returns {'new'|'up'|'down'|'flat'|null}
 */
function growthTrend(curVal, prevVal) {
  if (prevVal === null || prevVal === undefined) return null;
  if (prevVal === 0 && curVal > 0) return 'new';
  if (curVal > prevVal) return 'up';
  if (curVal < prevVal) return 'down';
  return 'flat';
}

/**
 * `total` counts every registration in scope (including `withdrawn`). Biometric and
 * `total_subject_combinations` counts exclude withdrawn (see SQL FILTER clauses).
 * @param {string|null|undefined} universityId
 * @param {string|null|undefined} sessionId
 * @returns {Promise<{
 *   total: number,
 *   approved: number,
 *   pending: number,
 *   rejected: number,
 *   biometric: number,
 *   without_biometric: number,
 *   total_subject_combinations: number
 * }>}
 */
const { getActiveStudentStatusCondition } = require('../utils/student-count');

async function kpiCounts(universityId, sessionId) {
  const filters = [];
  const params = [];
  let i = 1;
  if (universityId) {
    filters.push(`r.university_id = $${i++}`);
    params.push(universityId);
  }
  if (sessionId) {
    filters.push(`r.session_id = $${i++}`);
    params.push(sessionId);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const pendingIdx = i;
  params.push(PENDING_STATUSES);
  const activeFilter = getActiveStudentStatusCondition('r');
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE ${activeFilter})::int AS total,
      COUNT(*) FILTER (WHERE r.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE r.status = ANY($${pendingIdx}::text[]))::int AS pending,
      COUNT(*) FILTER (WHERE r.status = 'rejected')::int AS rejected,
      COUNT(*) FILTER (
        WHERE ${activeFilter} AND EXISTS (
          SELECT 1 FROM jupeb_biometric_captures bc
          WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
        )
      )::int AS biometric,
      COUNT(*) FILTER (
        WHERE ${activeFilter} AND NOT EXISTS (
          SELECT 1 FROM jupeb_biometric_captures bc
          WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
        )
      )::int AS without_biometric,
      COUNT(DISTINCT CASE
        WHEN ${activeFilter} AND r.subject_combination_id IS NOT NULL
        THEN r.subject_combination_id
      END)::int AS total_subject_combinations
    FROM jupeb_registrations r
    ${where}`;
  const r = await pool.query(sql, params);
  return r.rows[0];
}

/**
 * Resolve registration session: explicit id, else open session, else latest by opens_at.
 * @param {string|null|undefined} rawSessionId
 */
async function resolveRegistrationSession(rawSessionId) {
  if (rawSessionId) {
    assertUuid(rawSessionId, 'session_id');
    const r = await pool.query(
      `SELECT * FROM jupeb_registration_sessions WHERE id = $1`,
      [rawSessionId]
    );
    if (!r.rows[0]) throw httpError(404, 'Session not found');
    return r.rows[0];
  }
  const open = await pool.query(
    `SELECT * FROM jupeb_registration_sessions
     WHERE status = 'open' ORDER BY opens_at DESC LIMIT 1`
  );
  if (open.rows[0]) return open.rows[0];
  const fallback = await pool.query(
    `SELECT * FROM jupeb_registration_sessions
     ORDER BY opens_at DESC LIMIT 1`
  );
  return fallback.rows[0] || null;
}

async function findPreviousRegistrationSession(currentSession) {
  if (!currentSession) return null;
  const r = await pool.query(
    `SELECT id, academic_year FROM jupeb_registration_sessions
     WHERE opens_at < $1
     ORDER BY opens_at DESC LIMIT 1`,
    [currentSession.opens_at]
  );
  return r.rows[0] || null;
}

module.exports = {
  PENDING_STATUSES,
  kpiCounts,
  deltaPct,
  growthTrend,
  resolveRegistrationSession,
  findPreviousRegistrationSession,
};
