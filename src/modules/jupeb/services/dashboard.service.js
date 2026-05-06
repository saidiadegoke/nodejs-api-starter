const pool = require('../../../db/pool');
const { effectiveInstitutionListUniversityId } = require('../utils/institution-scope');

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

async function resolveUniversityId(userId, rawUniversityId) {
  assertUuid(rawUniversityId, 'university_id');
  return effectiveInstitutionListUniversityId(userId, rawUniversityId || null);
}

async function resolveSession(sessionId) {
  if (sessionId) {
    assertUuid(sessionId, 'session_id');
    const r = await pool.query(
      `SELECT id, academic_year, status, opens_at FROM jupeb_registration_sessions WHERE id = $1`,
      [sessionId]
    );
    if (!r.rows[0]) throw httpError(404, 'Session not found');
    return r.rows[0];
  }
  const open = await pool.query(
    `SELECT id, academic_year, status, opens_at FROM jupeb_registration_sessions
     WHERE status = 'open' ORDER BY opens_at DESC LIMIT 1`
  );
  if (open.rows[0]) return open.rows[0];
  const fallback = await pool.query(
    `SELECT id, academic_year, status, opens_at FROM jupeb_registration_sessions
     ORDER BY opens_at DESC LIMIT 1`
  );
  return fallback.rows[0] || null;
}

async function findPreviousSession(currentSession) {
  if (!currentSession) return null;
  const r = await pool.query(
    `SELECT id, academic_year FROM jupeb_registration_sessions
     WHERE opens_at < $1
     ORDER BY opens_at DESC LIMIT 1`,
    [currentSession.opens_at]
  );
  return r.rows[0] || null;
}

function deltaPct(current, previous) {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function statusBucket(status) {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

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
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE r.status <> 'withdrawn')::int AS total,
      COUNT(*) FILTER (WHERE r.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE r.status = ANY($${pendingIdx}::text[]))::int AS pending,
      COUNT(*) FILTER (
        WHERE r.status <> 'withdrawn' AND EXISTS (
          SELECT 1 FROM jupeb_biometric_captures bc
          WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
        )
      )::int AS biometric
    FROM jupeb_registrations r
    ${where}`;
  const r = await pool.query(sql, params);
  return r.rows[0];
}

class DashboardService {
  async getScope({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const session = await resolveSession(sessionId);
    let university = null;
    if (scopedUniversityId) {
      const r = await pool.query(
        `SELECT id, name, code, status FROM jupeb_universities WHERE id = $1`,
        [scopedUniversityId]
      );
      university = r.rows[0] || null;
    }
    return {
      university,
      session: session
        ? { id: session.id, label: session.academic_year, status: session.status }
        : null,
    };
  }

  async getStatCards({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const currentSession = await resolveSession(sessionId);
    const previousSession = await findPreviousSession(currentSession);

    const current = await kpiCounts(scopedUniversityId, currentSession?.id || null);
    const previous = previousSession
      ? await kpiCounts(scopedUniversityId, previousSession.id)
      : null;

    const card = (curVal, prevVal) => ({
      value: curVal,
      delta_pct: previous ? deltaPct(curVal, prevVal) : null,
    });

    return {
      total_registered: card(current.total, previous?.total),
      approved: card(current.approved, previous?.approved),
      pending: card(current.pending, previous?.pending),
      with_biometrics: card(current.biometric, previous?.biometric),
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year }
        : null,
    };
  }

  async getQuickStats({ universityId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const activeSession = await resolveSession(null);

    const params = [];
    let q = `SELECT COUNT(DISTINCT user_id)::int AS total
             FROM jupeb_registrations
             WHERE user_id IS NOT NULL AND status <> 'withdrawn'`;
    if (scopedUniversityId) {
      q += ` AND university_id = $1`;
      params.push(scopedUniversityId);
    }
    const r = await pool.query(q, params);
    return {
      total_students: r.rows[0].total,
      active_session: activeSession
        ? { id: activeSession.id, label: activeSession.academic_year, status: activeSession.status }
        : null,
    };
  }

  async getStudentsStatus({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    assertUuid(sessionId, 'session_id');

    const params = [];
    const filters = [];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (sessionId) {
      filters.push(`session_id = $${i++}`);
      params.push(sessionId);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    params.push(PENDING_STATUSES);
    const r = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected,
        COUNT(*) FILTER (WHERE status = ANY($${i}::text[]))::int AS pending
       FROM jupeb_registrations
       ${where}`,
      params
    );
    return r.rows[0];
  }

  async getRegistrationTrends({ universityId, year }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const y = parseInt(year, 10);
    const targetYear = Number.isFinite(y) ? y : new Date().getUTCFullYear();
    const previousYear = targetYear - 1;

    const monthlyForYear = async (yy) => {
      const params = [yy];
      let where = `EXTRACT(YEAR FROM created_at) = $1 AND status <> 'withdrawn'`;
      let i = 2;
      if (scopedUniversityId) {
        where += ` AND university_id = $${i++}`;
        params.push(scopedUniversityId);
      }
      const r = await pool.query(
        `SELECT EXTRACT(MONTH FROM created_at)::int AS m, COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE ${where}
         GROUP BY 1`,
        params
      );
      const map = new Map(r.rows.map((row) => [row.m, row.c]));
      return Array.from({ length: 12 }, (_, idx) => ({ month: idx + 1, count: map.get(idx + 1) || 0 }));
    };

    return {
      year: targetYear,
      series: [
        { key: 'current', year: targetYear, points: await monthlyForYear(targetYear) },
        { key: 'previous', year: previousYear, points: await monthlyForYear(previousYear) },
      ],
    };
  }

  async getSubjectEnrollment({ universityId, sessionId, limit }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    assertUuid(sessionId, 'session_id');
    const lim = Math.min(20, Math.max(1, parseInt(limit, 10) || 6));

    const params = [];
    const filters = [`r.subject_combination_id IS NOT NULL`, `r.status <> 'withdrawn'`];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (sessionId) {
      filters.push(`r.session_id = $${i++}`);
      params.push(sessionId);
    }
    params.push(lim);
    const result = await pool.query(
      `SELECT sc.id, sc.code, sc.name, COUNT(r.id)::int AS count
       FROM jupeb_registrations r
       JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
       WHERE ${filters.join(' AND ')}
       GROUP BY sc.id, sc.code, sc.name
       ORDER BY count DESC, sc.code ASC
       LIMIT $${i}`,
      params
    );
    return result.rows.map((row) => ({
      subject_combination_id: row.id,
      code: row.code,
      label: row.name,
      count: row.count,
    }));
  }

  async getRecentRegistrations({ universityId, sessionId, limit }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    assertUuid(sessionId, 'session_id');
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 5));

    const params = [];
    const filters = [`r.status <> 'withdrawn'`];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (sessionId) {
      filters.push(`r.session_id = $${i++}`);
      params.push(sessionId);
    }
    params.push(lim);
    const result = await pool.query(
      `SELECT
         r.id AS registration_id,
         COALESCE(r.institution_issued_code, r.provisional_candidate_code) AS candidate_id,
         r.status AS raw_status,
         r.submitted_at,
         r.created_at,
         u.email AS user_email,
         p.first_name,
         p.last_name,
         p.display_name,
         p.profile_photo_url,
         sc.id AS subject_combination_id,
         sc.code AS subject_combination_code,
         EXISTS (
           SELECT 1 FROM jupeb_biometric_captures bc
           WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
         ) AS biometric_captured
       FROM jupeb_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       LEFT JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
       WHERE ${filters.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${i}`,
      params
    );

    return result.rows.map((row) => {
      const fullName =
        row.display_name || [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || null;
      return {
        registration_id: row.registration_id,
        candidate_id: row.candidate_id,
        name: fullName,
        email: row.user_email,
        avatar_url: row.profile_photo_url,
        subject_combination: row.subject_combination_id
          ? { id: row.subject_combination_id, code: row.subject_combination_code }
          : null,
        biometric_captured: row.biometric_captured,
        status: statusBucket(row.raw_status),
        raw_status: row.raw_status,
        submitted_at: row.submitted_at,
        created_at: row.created_at,
      };
    });
  }
}

module.exports = new DashboardService();
