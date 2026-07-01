const pool = require('../../../db/pool');
const { effectiveInstitutionListUniversityId } = require('../utils/institution-scope');
const subjectCombinationModel = require('../models/subject-combination.model');
const {
  PENDING_STATUSES,
  kpiCounts,
  deltaPct,
  growthTrend,
  findPreviousRegistrationSession,
} = require('./registration-kpi.service');
const {
  getActiveSession,
  resolveEffectiveSession,
  getSessionContext,
} = require('./session-context.service');

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

// Inclusive list of { year, month } buckets from `start` to `end`. A
// session window can straddle a calendar-year boundary (e.g. Sep→Aug),
// so buckets carry the year too. Always terminates — the DB CHECK
// `opens_at < closes_at` guarantees start ≤ end.
function monthBuckets(start, end) {
  const buckets = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    buckets.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return buckets;
}

async function resolveUniversityId(userId, rawUniversityId) {
  assertUuid(rawUniversityId, 'university_id');
  return effectiveInstitutionListUniversityId(userId, rawUniversityId || null);
}

const resolveSessionForUser = (userId, querySessionId) =>
  resolveEffectiveSession(userId, querySessionId || null);
const findPreviousSession = findPreviousRegistrationSession;

function statusBucket(status) {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

// Count active (non-deleted) universities. Optional filter by type so
// the same helper drives both the quick-stats count and the donut-chart
// slices.
async function institutionsCount({ universityType } = {}) {
  const params = [];
  let where = `deleted_at IS NULL AND status = 'active'`;
  if (universityType) {
    where += ` AND university_type = $1`;
    params.push(universityType);
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM jupeb_universities WHERE ${where}`,
    params
  );
  return r.rows[0].c;
}

// Onboarded / active / inactive university counts in one pass.
// `onboarded` is every non-deleted institution (active + inactive) —
// an institution stays "onboarded" even after it's deactivated.
async function institutionStatusCounts() {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS onboarded,
       COUNT(*) FILTER (WHERE status = 'active')::int   AS active,
       COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive
     FROM jupeb_universities
     WHERE deleted_at IS NULL`
  );
  return r.rows[0];
}

// Catalog-wide subject metrics for the stat cards. `total_subjects`
// counts every non-deleted subject (active + inactive); `inactive_subjects`
// is the inactive subset; `total_subject_combinations` is every
// non-deleted combination. Not session- or institution-scoped — the
// subject catalog is global.
async function subjectCatalogCounts() {
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM jupeb_subjects
         WHERE deleted_at IS NULL) AS total_subjects,
       (SELECT COUNT(*)::int FROM jupeb_subjects
         WHERE deleted_at IS NULL AND status = 'inactive') AS inactive_subjects,
       (SELECT COUNT(*)::int FROM jupeb_subject_combinations
         WHERE deleted_at IS NULL) AS total_subject_combinations`
  );
  return r.rows[0];
}

class DashboardService {
  async getScope({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const session = await resolveSessionForUser(userId, sessionId);
    const context = await getSessionContext(userId);
    let university = null;
    if (scopedUniversityId) {
      const r = await pool.query(
        `SELECT id, name, code, status FROM jupeb_universities WHERE id = $1`,
        [scopedUniversityId]
      );
      university = r.rows[0] || null;
    }
    const effective = session
      ? { id: session.id, label: session.academic_year, status: session.status }
      : context.effective_session;
    return {
      university,
      session: effective,
      active_session: context.active_session,
      viewing_session: context.viewing_session,
      effective_session: effective,
    };
  }

  async getStatCards({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const currentSession = await resolveSessionForUser(userId, sessionId);
    const previousSession = await findPreviousSession(currentSession);

    const current = await kpiCounts(scopedUniversityId, currentSession?.id || null);
    const previous = previousSession
      ? await kpiCounts(scopedUniversityId, previousSession.id)
      : null;

    const card = (curVal, prevVal) => ({
      value: curVal,
      delta_pct: previous ? deltaPct(curVal, prevVal) : null,
    });

    // Institution + subject counts — derived from the catalog tables,
    // not the per-session registration table. There's no notion of a
    // "previous session" for catalog data (universities / subjects
    // aren't session-scoped), so delta_pct is always null here. The
    // frontend shows the value without the comparison arrow.
    const institutions = await institutionStatusCounts();
    const subjectCounts = await subjectCatalogCounts();

    return {
      institutions_onboarded: { value: institutions.onboarded, delta_pct: null },
      active_institutions: { value: institutions.active, delta_pct: null },
      inactive_institutions: { value: institutions.inactive, delta_pct: null },
      total_registered: card(current.total, previous?.total),
      approved: card(current.approved, previous?.approved),
      pending: card(current.pending, previous?.pending),
      with_biometrics: card(current.biometric, previous?.biometric),
      without_biometrics: card(current.without_biometric, previous?.without_biometric),
      total_subjects: { value: subjectCounts.total_subjects, delta_pct: null },
      total_subject_combinations: { value: subjectCounts.total_subject_combinations, delta_pct: null },
      inactive_subjects: { value: subjectCounts.inactive_subjects, delta_pct: null },
      compared_to: previousSession
        ? { session_id: previousSession.id, label: previousSession.academic_year }
        : null,
    };
  }

  async getQuickStats({ universityId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const activeSession = await getActiveSession();
    const effectiveSession = await resolveSessionForUser(userId, null);

    const params = [];
    let q = `SELECT COUNT(DISTINCT user_id)::int AS total
             FROM jupeb_registrations
             WHERE user_id IS NOT NULL AND status <> 'withdrawn'`;
    if (scopedUniversityId) {
      q += ` AND university_id = $1`;
      params.push(scopedUniversityId);
    }
    const r = await pool.query(q, params);
    const inst = await institutionsCount();
    const toBrief = (s) =>
      s ? { id: s.id, label: s.academic_year, status: s.status } : null;
    return {
      total_students: r.rows[0].total,
      institutions_count: inst,
      active_session: toBrief(activeSession),
      effective_session: toBrief(effectiveSession),
    };
  }

  /**
   * Donut chart: distribution of institutions by `university_type`
   * (`federal` / `state` / `private` / null). Returns counts + percent
   * shares — the frontend draws the donut directly off this.
   */
  async getInstitutionDistribution() {
    const r = await pool.query(
      `SELECT COALESCE(university_type, 'unspecified') AS type,
              COUNT(*)::int AS count
         FROM jupeb_universities
        WHERE deleted_at IS NULL AND status = 'active'
        GROUP BY 1
        ORDER BY 2 DESC`
    );
    const total = r.rows.reduce((sum, row) => sum + row.count, 0);
    const slices = r.rows.map((row) => ({
      type: row.type,
      count: row.count,
      pct: total ? Number(((row.count / total) * 100).toFixed(1)) : 0,
    }));
    return { total, slices };
  }

  /**
   * Line chart: institutions onboarded over time. Counts universities by
   * the calendar month of `created_at` — current + previous year, full
   * Jan–Dec — so the "Institution onboarding Trends" chart can plot the
   * two series. `deleted_at IS NULL` only; status is ignored (an
   * institution counts as onboarded even once deactivated).
   */
  async getInstitutionTrends({ year }) {
    const y = parseInt(year, 10);
    const targetYear = Number.isFinite(y) ? y : new Date().getUTCFullYear();
    const previousYear = targetYear - 1;

    const monthlyForYear = async (yy) => {
      const r = await pool.query(
        `SELECT EXTRACT(MONTH FROM created_at)::int AS m, COUNT(*)::int AS c
           FROM jupeb_universities
          WHERE deleted_at IS NULL AND EXTRACT(YEAR FROM created_at) = $1
          GROUP BY 1`,
        [yy]
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

  /**
   * Donut / distribution: enrollment share across subject combinations.
   * Like getInstitutionDistribution but keyed by combination — counts
   * non-withdrawn registrations per combination, plus percent shares.
   * Optionally scoped by university + session.
   */
  async getSubjectCombinationDistribution({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    // Scope to one session — defaults to the open / latest session.
    const session = await resolveSessionForUser(userId, sessionId);
    if (!session) return { session_id: null, total: 0, slices: [] };

    const params = [session.id];
    const filters = [
      `r.subject_combination_id IS NOT NULL`,
      `r.status <> 'withdrawn'`,
      `r.session_id = $1`,
    ];
    let i = 2;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    const r = await pool.query(
      `SELECT sc.id, sc.code, sc.title, COUNT(r.id)::int AS count
         FROM jupeb_registrations r
         JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
        WHERE ${filters.join(' AND ')}
        GROUP BY sc.id, sc.code, sc.title
        ORDER BY count DESC, sc.code ASC`,
      params
    );
    // Attach the constituent subjects of each combination (one batched query).
    const itemsMap = await subjectCombinationModel.listItemsForCombinations(
      r.rows.map((row) => row.id)
    );
    const total = r.rows.reduce((sum, row) => sum + row.count, 0);
    const slices = r.rows.map((row) => ({
      subject_combination_id: row.id,
      code: row.code,
      title: row.title,
      subjects: (itemsMap.get(row.id) || []).map((it) => ({ code: it.code, name: it.name })),
      count: row.count,
      pct: total ? Number(((row.count / total) * 100).toFixed(1)) : 0,
    }));
    return { session_id: session.id, total, slices };
  }

  /**
   * Registration timeline for the Registration Management header card:
   * the current session's open and close dates plus the live "now" so
   * the client can render the progress indicator without doing its own
   * clock arithmetic.
   */
  async getSessionTimeline({ sessionId }, userId) {
    assertUuid(sessionId, 'session_id');
    const session = await resolveSessionForUser(userId, sessionId);
    if (!session) return null;
    const r = await pool.query(
      `SELECT id, academic_year, year_short, status, opens_at, closes_at,
              candidate_info_cutoff_at, profile_update_cutoff_at, ca_cutoff_at
         FROM jupeb_registration_sessions WHERE id = $1`,
      [session.id]
    );
    const row = r.rows[0];
    if (!row) return null;
    const now = new Date();
    const opens = row.opens_at ? new Date(row.opens_at) : null;
    const closes = row.closes_at ? new Date(row.closes_at) : null;
    const within = opens && closes && now >= opens && now <= closes;
    return {
      session_id: row.id,
      academic_year: row.academic_year,
      year_short: row.year_short,
      status: row.status,
      opens_at: row.opens_at,
      closes_at: row.closes_at,
      candidate_info_cutoff_at: row.candidate_info_cutoff_at,
      profile_update_cutoff_at: row.profile_update_cutoff_at,
      ca_cutoff_at: row.ca_cutoff_at,
      now: now.toISOString(),
      within_window: !!within,
    };
  }

  async getStudentsStatus({ universityId, sessionId }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    assertUuid(sessionId, 'session_id');
    const session = await resolveSessionForUser(userId, sessionId);

    const params = [];
    const filters = [];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (session) {
      filters.push(`session_id = $${i++}`);
      params.push(session.id);
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

  async getRegistrationTrends({ universityId, sessionId, year }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);

    const session = await resolveSessionForUser(userId, sessionId);

    // ── Session-scoped: a single series spanning ONLY the months inside
    // the session's window (opens_at → closes_at). The window can cross
    // a calendar-year boundary, so points carry { year, month }. The
    // `year` param and the previous-year comparison don't apply here.
    if (session) {
      const params = [session.id];
      let where = `session_id = $1 AND status <> 'withdrawn'`;
      let i = 2;
      if (scopedUniversityId) {
        where += ` AND university_id = $${i++}`;
        params.push(scopedUniversityId);
      }
      const r = await pool.query(
        `SELECT EXTRACT(YEAR FROM created_at)::int AS y,
                EXTRACT(MONTH FROM created_at)::int AS m,
                COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE ${where}
         GROUP BY 1, 2`,
        params
      );
      const map = new Map(r.rows.map((row) => [`${row.y}-${row.m}`, row.c]));
      const points = monthBuckets(
        new Date(session.opens_at),
        new Date(session.closes_at)
      ).map((b) => ({
        year: b.year,
        month: b.month,
        count: map.get(`${b.year}-${b.month}`) || 0,
      }));
      return {
        session: {
          id: session.id,
          academic_year: session.academic_year,
          opens_at: session.opens_at,
          closes_at: session.closes_at,
        },
        series: [{ key: 'current', points }],
      };
    }

    // ── Calendar-year mode: current + previous year, full Jan–Dec.
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
      session: null,
      series: [
        { key: 'current', year: targetYear, points: await monthlyForYear(targetYear) },
        { key: 'previous', year: previousYear, points: await monthlyForYear(previousYear) },
      ],
    };
  }

  async getSubjectEnrollment({ universityId, sessionId, limit }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    // Scope to one session — defaults to the open / latest session so the
    // chart shows the *current* intake, not a sum across every session.
    const session = await resolveSessionForUser(userId, sessionId);
    if (!session) return [];
    const lim = Math.min(20, Math.max(1, parseInt(limit, 10) || 6));

    const params = [session.id];
    const filters = [
      `r.subject_combination_id IS NOT NULL`,
      `r.status <> 'withdrawn'`,
      `r.session_id = $1`,
    ];
    let i = 2;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    params.push(lim);
    const result = await pool.query(
      `SELECT sc.id, sc.code, sc.title, COUNT(r.id)::int AS count
       FROM jupeb_registrations r
       JOIN jupeb_subject_combinations sc ON sc.id = r.subject_combination_id
       WHERE ${filters.join(' AND ')}
       GROUP BY sc.id, sc.code, sc.title
       ORDER BY count DESC, sc.code ASC
       LIMIT $${i}`,
      params
    );
    // Attach the constituent subjects of each combination (one batched query).
    const itemsMap = await subjectCombinationModel.listItemsForCombinations(
      result.rows.map((row) => row.id)
    );
    return result.rows.map((row) => ({
      subject_combination_id: row.id,
      code: row.code,
      label: row.title,
      count: row.count,
      subjects: (itemsMap.get(row.id) || []).map((it) => ({ code: it.code, name: it.name })),
    }));
  }

  /**
   * Enrollment counted by individual subject (not by combination): for
   * each subject, how many non-withdrawn registrations sit in a
   * combination that includes it. Powers a per-subject bar chart —
   * `[{ subject_id, code, name, count }]`, biggest first. Scopes to the
   * open / latest session by default; `limit` is optional (top-N).
   */
  async getEnrollmentBySubject({ universityId, sessionId, limit }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    const session = await resolveSessionForUser(userId, sessionId);
    if (!session) return [];

    const params = [session.id];
    const filters = [
      `r.status <> 'withdrawn'`,
      `r.session_id = $1`,
      `s.deleted_at IS NULL`,
    ];
    let i = 2;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    let limitClause = '';
    if (limit !== undefined && limit !== null && limit !== '') {
      const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 0));
      if (lim) {
        params.push(lim);
        limitClause = `LIMIT $${i}`;
      }
    }
    const result = await pool.query(
      `SELECT s.id, s.code, s.name, COUNT(DISTINCT r.id)::int AS count
         FROM jupeb_subjects s
         JOIN jupeb_subject_combination_items i ON i.subject_id = s.id
         JOIN jupeb_registrations r ON r.subject_combination_id = i.combination_id
        WHERE ${filters.join(' AND ')}
        GROUP BY s.id, s.code, s.name
        ORDER BY count DESC, s.name ASC
        ${limitClause}`,
      params
    );
    return result.rows.map((row) => ({
      subject_id: row.id,
      code: row.code,
      name: row.name,
      count: row.count,
    }));
  }

  async getRecentRegistrations({ universityId, sessionId, limit }, userId) {
    const scopedUniversityId = await resolveUniversityId(userId, universityId);
    assertUuid(sessionId, 'session_id');
    const session = await resolveSessionForUser(userId, sessionId);
    const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 5));

    const params = [];
    const filters = [`r.status <> 'withdrawn'`];
    let i = 1;
    if (scopedUniversityId) {
      filters.push(`r.university_id = $${i++}`);
      params.push(scopedUniversityId);
    }
    if (session) {
      filters.push(`r.session_id = $${i++}`);
      params.push(session.id);
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
