const pool = require('../../../db/pool');
const { resolveRegistrationSession } = require('./registration-kpi.service');
const { evaluateSessionWindows } = require('../utils/session-validation');

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

function toSessionSummary(row) {
  if (!row) return null;
  const windows = evaluateSessionWindows(row);
  return {
    id: row.id,
    label: row.academic_year,
    status: row.status,
    registration_locked: Boolean(row.registration_locked),
    opens_at: row.opens_at || null,
    closes_at: row.closes_at || null,
    // Cutoff state so the portal can grey out actions before the request
    // fails. `*_closed` is true once the bound is reached; a session with no
    // bound configured reports false (no restriction).
    candidate_info_cutoff_at: windows.cutoffs.candidate_info.at,
    profile_update_cutoff_at: windows.cutoffs.profile_update.at,
    ca_cutoff_at: windows.cutoffs.ca.at,
    window_open: windows.within_window,
    candidate_info_closed: windows.cutoffs.candidate_info.passed,
    profile_update_closed: windows.cutoffs.profile_update.passed,
    ca_closed: windows.cutoffs.ca.passed,
  };
}

async function getActiveSession() {
  return resolveRegistrationSession(null);
}

async function getUserViewingSessionId(userId) {
  if (!userId) return null;
  const r = await pool.query(
    `SELECT viewing_jupeb_session_id FROM profiles WHERE user_id = $1`,
    [userId]
  );
  return r.rows[0]?.viewing_jupeb_session_id || null;
}

async function setUserViewingSession(userId, sessionId) {
  if (!userId) throw httpError(401, 'Authentication required');
  if (!sessionId || !isUuid(sessionId)) {
    throw httpError(422, 'session_id is required and must be a valid UUID');
  }
  const session = await resolveRegistrationSession(sessionId);
  if (!session) throw httpError(404, 'Session not found');
  await pool.query(
    `UPDATE profiles
        SET viewing_jupeb_session_id = $2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1`,
    [userId, sessionId]
  );
  return session;
}

async function clearUserViewingSession(userId) {
  if (!userId) throw httpError(401, 'Authentication required');
  await pool.query(
    `UPDATE profiles
        SET viewing_jupeb_session_id = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1`,
    [userId]
  );
}

/**
 * Read context: explicit query session_id → user viewing preference → global open session.
 */
async function resolveEffectiveSession(userId, querySessionId) {
  if (querySessionId) {
    return resolveRegistrationSession(querySessionId);
  }
  const viewingId = userId ? await getUserViewingSessionId(userId) : null;
  if (viewingId) {
    const viewing = await resolveRegistrationSession(viewingId);
    if (viewing) return viewing;
  }
  return getActiveSession();
}

async function getSessionContext(userId) {
  const activeSession = await getActiveSession();
  const viewingId = userId ? await getUserViewingSessionId(userId) : null;
  let viewingSession = null;
  if (viewingId) {
    try {
      viewingSession = await resolveRegistrationSession(viewingId);
    } catch {
      viewingSession = null;
    }
  }
  const effectiveSession = viewingSession || activeSession;
  return {
    active_session: toSessionSummary(activeSession),
    viewing_session: toSessionSummary(viewingSession),
    effective_session: toSessionSummary(effectiveSession),
  };
}

module.exports = {
  getActiveSession,
  getUserViewingSessionId,
  setUserViewingSession,
  clearUserViewingSession,
  resolveEffectiveSession,
  getSessionContext,
  toSessionSummary,
};
