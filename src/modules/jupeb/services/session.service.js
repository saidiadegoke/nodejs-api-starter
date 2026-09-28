const sessionModel = require('../models/session.model');
const pool = require('../../../db/pool');
const registrationService = require('./registration.service');
const sessionContext = require('./session-context.service');
const {
  kpiCounts,
} = require('./registration-kpi.service');
const { validateYearShortForAcademicYear, canTransitionStatus } = require('../utils/session-validation');

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function parseTs(value, label) {
  if (value === undefined || value === null) {
    throw httpError(422, `${label} is required`);
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw httpError(422, `${label} must be a valid ISO date`);
  }
  return d;
}

function parseNullableTs(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return parseTs(value, label).toISOString();
}

function parsePositiveMoney(value, label, { allowNull = true } = {}) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    if (allowNull) return null;
    throw httpError(422, `${label} must be a positive number`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw httpError(422, `${label} must be a positive number or null`);
  }
  return n;
}

function parseNonNegativeMoney(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw httpError(422, `${label} must be a non-negative number`);
  }
  return n;
}

function parseMaxCaScore(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 100) {
    throw httpError(422, 'max_ca_score must be an integer between 0 and 100');
  }
  return n;
}

function parseCurrency(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const currency = String(value).trim().toUpperCase().slice(0, 3);
  if (currency.length !== 3) {
    throw httpError(422, 'registration_fee_currency must be a 3-letter code');
  }
  return currency;
}

function nullableTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const PATCHABLE_SESSION_FIELDS = new Set([
  'academic_year',
  'year_short',
  'opens_at',
  'closes_at',
  'student_submission_deadline',
  'institution_approval_deadline',
  'notes',
  'description',
  'registration_fee_amount',
  'registration_fee_currency',
  'candidate_info_cutoff_at',
  'profile_update_cutoff_at',
  'ca_cutoff_at',
  'max_ca_score',
  'affiliation_fee_existing',
  'affiliation_fee_new',
  'exam_fee_per_candidate',
]);

class SessionService {
  async list({ page, limit, status, q }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const rows = await sessionModel.findAll({ limit: safeLimit, offset, status, q });
    const total = await sessionModel.count({ status, q });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async getById(id) {
    if (!isUuid(id)) throw httpError(422, 'Invalid session id');
    const row = await sessionModel.findById(id);
    if (!row) throw httpError(404, 'Session not found');
    return row;
  }

  async create(body, userId) {
    const {
      academic_year,
      year_short,
      opens_at,
      closes_at,
      student_submission_deadline,
      institution_approval_deadline,
      notes,
      description,
      registration_fee_amount,
      registration_fee_currency,
      candidate_info_cutoff_at,
      profile_update_cutoff_at,
      ca_cutoff_at,
      max_ca_score,
      affiliation_fee_existing,
      affiliation_fee_new,
      exam_fee_per_candidate,
    } = body;
    if (!academic_year || !year_short) {
      throw httpError(422, 'academic_year and year_short are required');
    }
    const y = validateYearShortForAcademicYear(academic_year, year_short);
    if (!y.ok) throw httpError(422, y.error);
    const o = parseTs(opens_at, 'opens_at');
    const c = parseTs(closes_at, 'closes_at');
    if (o.getTime() >= c.getTime()) {
      throw httpError(422, 'opens_at must be before closes_at');
    }
    const sdl = student_submission_deadline ? parseTs(student_submission_deadline, 'student_submission_deadline') : null;
    const adl = institution_approval_deadline
      ? parseTs(institution_approval_deadline, 'institution_approval_deadline')
      : null;
    let feeAmount = null;
    let feeCurrency = null;
    if (registration_fee_amount !== undefined && registration_fee_amount !== null) {
      feeAmount = Number(registration_fee_amount);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
        throw httpError(422, 'registration_fee_amount must be a positive number when set');
      }
    }
    if (registration_fee_currency !== undefined && registration_fee_currency !== null) {
      feeCurrency = String(registration_fee_currency).trim().toUpperCase().slice(0, 3);
      if (feeCurrency.length !== 3) throw httpError(422, 'registration_fee_currency must be a 3-letter code');
    }
    if (feeAmount != null && feeCurrency == null) {
      feeCurrency = 'NGN';
    }
    const cutoffCandidate = candidate_info_cutoff_at
      ? parseTs(candidate_info_cutoff_at, 'candidate_info_cutoff_at')
      : null;
    const cutoffProfile = profile_update_cutoff_at
      ? parseTs(profile_update_cutoff_at, 'profile_update_cutoff_at')
      : null;
    const cutoffCa = ca_cutoff_at ? parseTs(ca_cutoff_at, 'ca_cutoff_at') : null;
    const ordered = [
      ['Session close date', c],
      ['Candidate info cutoff', cutoffCandidate],
      ['Profile update cutoff', cutoffProfile],
      ['CA cutoff', cutoffCa],
    ].filter(([, v]) => v != null);
    for (let i = 1; i < ordered.length; i += 1) {
      const [prevName, prevTs] = ordered[i - 1];
      const [thisName, thisTs] = ordered[i];
      if (thisTs.getTime() < prevTs.getTime()) {
        const fmt = (d) => d.toISOString().replace('T', ' ').substring(0, 16);
        throw httpError(422, `The ${thisName} (${fmt(thisTs)}) cannot be earlier than the ${prevName} (${fmt(prevTs)}).`);
      }
    }

    let maxCaScore = null;
    if (max_ca_score !== undefined && max_ca_score !== null && max_ca_score !== '') {
      maxCaScore = Number(max_ca_score);
      if (!Number.isFinite(maxCaScore) || !Number.isInteger(maxCaScore) || maxCaScore < 0 || maxCaScore > 100) {
        throw httpError(422, 'max_ca_score must be an integer between 0 and 100');
      }
    }

    function nonNegMoney(label, value) {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        throw httpError(422, `${label} must be a non-negative number`);
      }
      return n;
    }

    try {
      await sessionModel.closeOpenSessions(userId);
      return await sessionModel.create({
        academic_year,
        year_short,
        opens_at: o.toISOString(),
        closes_at: c.toISOString(),
        student_submission_deadline: sdl ? sdl.toISOString() : null,
        institution_approval_deadline: adl ? adl.toISOString() : null,
        notes: notes !== undefined ? notes || null : description || null,
        created_by: userId,
        registration_fee_amount: feeAmount,
        registration_fee_currency: feeCurrency,
        candidate_info_cutoff_at: cutoffCandidate ? cutoffCandidate.toISOString() : null,
        profile_update_cutoff_at: cutoffProfile ? cutoffProfile.toISOString() : null,
        ca_cutoff_at: cutoffCa ? cutoffCa.toISOString() : null,
        max_ca_score: maxCaScore,
        affiliation_fee_existing: nonNegMoney('affiliation_fee_existing', affiliation_fee_existing),
        affiliation_fee_new: nonNegMoney('affiliation_fee_new', affiliation_fee_new),
        exam_fee_per_candidate: nonNegMoney('exam_fee_per_candidate', exam_fee_per_candidate),
      });
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'A session with this academic_year already exists');
      throw e;
    }
  }

  async patch(id, body, userId) {
    const row = await this.getById(id);
    const payload = body || {};
    const disallowed = Object.keys(payload).filter(
      (k) => payload[k] !== undefined && !PATCHABLE_SESSION_FIELDS.has(k)
    );
    if (disallowed.length) {
      throw httpError(422, `Unsupported session field(s): ${disallowed.join(', ')}`);
    }
    const fields = {};

    if (payload.academic_year !== undefined) {
      fields.academic_year = String(payload.academic_year || '').trim();
      if (!fields.academic_year) throw httpError(422, 'academic_year cannot be empty');
    }
    if (payload.year_short !== undefined) {
      fields.year_short = String(payload.year_short || '').trim();
      if (!fields.year_short) throw httpError(422, 'year_short cannot be empty');
    }
    if (fields.academic_year !== undefined || fields.year_short !== undefined) {
      const y = validateYearShortForAcademicYear(
        fields.academic_year !== undefined ? fields.academic_year : row.academic_year,
        fields.year_short !== undefined ? fields.year_short : row.year_short
      );
      if (!y.ok) throw httpError(422, y.error);
    }

    if (payload.opens_at !== undefined) fields.opens_at = parseTs(payload.opens_at, 'opens_at').toISOString();
    if (payload.closes_at !== undefined) fields.closes_at = parseTs(payload.closes_at, 'closes_at').toISOString();
    const opens = nullableTime(fields.opens_at !== undefined ? fields.opens_at : row.opens_at);
    const closes = nullableTime(fields.closes_at !== undefined ? fields.closes_at : row.closes_at);
    if (!opens || !closes) {
      throw httpError(422, 'opens_at and closes_at are required');
    }
    if (opens.getTime() >= closes.getTime()) {
      throw httpError(422, 'opens_at must be before closes_at');
    }

    for (const key of [
      'student_submission_deadline',
      'institution_approval_deadline',
      'candidate_info_cutoff_at',
      'profile_update_cutoff_at',
      'ca_cutoff_at',
    ]) {
      if (payload[key] !== undefined) fields[key] = parseNullableTs(payload[key], key);
    }

    const ordered = [
      ['Session close date', closes],
      [
        'Candidate info cutoff',
        nullableTime(fields.candidate_info_cutoff_at !== undefined
          ? fields.candidate_info_cutoff_at
          : row.candidate_info_cutoff_at),
      ],
      [
        'Profile update cutoff',
        nullableTime(fields.profile_update_cutoff_at !== undefined
          ? fields.profile_update_cutoff_at
          : row.profile_update_cutoff_at),
      ],
      [
        'CA cutoff',
        nullableTime(fields.ca_cutoff_at !== undefined ? fields.ca_cutoff_at : row.ca_cutoff_at),
      ],
    ].filter(([, v]) => v != null);
    for (let i = 1; i < ordered.length; i += 1) {
      const [prevName, prevTs] = ordered[i - 1];
      const [thisName, thisTs] = ordered[i];
      if (thisTs.getTime() < prevTs.getTime()) {
        const fmt = (d) => d.toISOString().replace('T', ' ').substring(0, 16);
        throw httpError(422, `The ${thisName} (${fmt(thisTs)}) cannot be earlier than the ${prevName} (${fmt(prevTs)}).`);
      }
    }

    if (payload.notes !== undefined) {
      fields.notes = payload.notes || null;
    } else if (payload.description !== undefined) {
      fields.notes = payload.description || null;
    }

    const registrationFeeAmount = parsePositiveMoney(
      payload.registration_fee_amount,
      'registration_fee_amount'
    );
    if (registrationFeeAmount !== undefined) fields.registration_fee_amount = registrationFeeAmount;

    const registrationFeeCurrency = parseCurrency(payload.registration_fee_currency);
    if (registrationFeeCurrency !== undefined) fields.registration_fee_currency = registrationFeeCurrency;
    if (
      fields.registration_fee_amount != null
      && fields.registration_fee_currency === undefined
      && !row.registration_fee_currency
    ) {
      fields.registration_fee_currency = 'NGN';
    }

    const maxCaScore = parseMaxCaScore(payload.max_ca_score);
    if (maxCaScore !== undefined) fields.max_ca_score = maxCaScore;

    for (const key of ['affiliation_fee_existing', 'affiliation_fee_new', 'exam_fee_per_candidate']) {
      const amount = parseNonNegativeMoney(payload[key], key);
      if (amount !== undefined) fields[key] = amount;
    }

    if (Object.keys(fields).length === 0) {
      throw httpError(422, 'No updatable session fields supplied');
    }
    fields.updated_by = userId;
    try {
      return await sessionModel.updateById(id, fields);
    } catch (e) {
      if (e.code === '23505') throw httpError(409, 'A session with this academic_year already exists');
      throw e;
    }
  }

  async open(id, userId) {
    const row = await this.getById(id);
    if (row.status === 'open') {
      return row;
    }
    if (!canTransitionStatus(row.status, 'open')) {
      throw httpError(422, `Cannot open session in status ${row.status}`);
    }
    const others = await sessionModel.countOtherOpenSessions(id);
    if (others > 0) {
      throw httpError(409, 'Another session is already open; close it before opening this one');
    }
    const updated = await sessionModel.setStatus(id, 'open', userId);
    await sessionModel.insertEvent(id, 'opened', {}, userId);
    return updated;
  }

  async close(id, userId) {
    const row = await this.getById(id);
    if (row.status === 'closed') {
      return row;
    }
    if (row.status !== 'open') {
      throw httpError(422, `Cannot close session in status ${row.status}`);
    }
    const updated = await sessionModel.setStatus(id, 'closed', userId);
    await sessionModel.insertEvent(id, 'closed', {}, userId);
    return updated;
  }

  async reopen(id, userId) {
    const row = await this.getById(id);
    if (!canTransitionStatus(row.status, 'open')) {
      throw httpError(422, `Cannot reopen session in status ${row.status}`);
    }
    const others = await sessionModel.countOtherOpenSessions(id);
    if (others > 0) {
      throw httpError(409, 'Another session is already open');
    }
    const updated = await sessionModel.setStatus(id, 'open', userId);
    await sessionModel.insertEvent(id, 'reopened', {}, userId);
    return updated;
  }

  async setRegistrationLock(id, body, userId) {
    await this.getById(id);
    if (!body || typeof body.locked !== 'boolean') {
      throw httpError(422, 'locked must be a boolean');
    }

    const hasUniversityIds = Array.isArray(body.university_ids);
    const hasUniversityId = typeof body.university_id === 'string' && Boolean(body.university_id.trim());

    if (hasUniversityIds || hasUniversityId) {
      const rawIds = hasUniversityIds ? body.university_ids : [body.university_id.trim()];
      if (!rawIds.length) {
        throw httpError(422, 'university_ids must not be empty');
      }
      for (const uniId of rawIds) {
        if (!isUuid(uniId)) {
          throw httpError(422, `Invalid university ID: ${uniId}`);
        }
      }

      const uniCheck = await pool.query(
        `SELECT id FROM jupeb_universities WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
        [rawIds]
      );
      if (uniCheck.rows.length !== rawIds.length) {
        throw httpError(404, 'One or more universities were not found');
      }

      const updatedRows = await sessionModel.setUniversityRegistrationLocks(id, {
        universityIds: rawIds,
        locked: body.locked,
        reason: body.reason,
        userId,
      });

      await sessionModel.insertEvent(
        id,
        body.locked ? 'institution_registration_locked' : 'institution_registration_unlocked',
        {
          university_ids: rawIds,
          locked: body.locked,
          reason: body.reason || null,
        },
        userId
      );

      return {
        session_id: id,
        locked: body.locked,
        reason: body.reason || null,
        university_ids: rawIds,
        updated_count: updatedRows.length,
        items: updatedRows,
      };
    }

    const updated = await sessionModel.setRegistrationLocked(id, body.locked, userId);
    await sessionModel.insertEvent(
      id,
      body.locked ? 'registration_locked' : 'registration_unlocked',
      { registration_locked: body.locked },
      userId
    );
    return updated;
  }

  async getUniversityRegistrationLocks(id, query = {}) {
    await this.getById(id);
    return sessionModel.getUniversityRegistrationLocks(id, query);
  }

  async finalizeCandidateNumbers(id, userId) {
    const row = await this.getById(id);
    if (row.status !== 'closed') {
      throw httpError(422, 'Candidate numbers can only be finalized for a closed session');
    }
    await sessionModel.insertEvent(id, 'finalization_triggered', {}, userId);
    return registrationService.finalizeCandidateNumbers(id, userId);
  }

  /**
   * Sweep finalize over every closed session in one call. Useful for
   * the registrar's end-of-year batch. Per-session errors are captured
   * (not thrown) so a single bad session doesn't abort the run.
   */
  async finalizeAllClosed(userId) {
    return registrationService.finalizeAllClosedSessions(userId);
  }

  async _institutionsInSession(sessionId) {
    const r = await pool.query(
      `SELECT COUNT(DISTINCT university_id)::int AS c
         FROM jupeb_registrations
        WHERE session_id = $1 AND university_id IS NOT NULL`,
      [sessionId]
    );
    return r.rows[0].c || 0;
  }

  async _sessionMetrics(sessionId) {
    const kpi = await kpiCounts(null, sessionId);
    return {
      exams: null,
      institutions: await this._institutionsInSession(sessionId),
      total_candidates: kpi.total,
      current_candidates_enrolled: kpi.approved,
      candidates_with_biometrics: kpi.biometric,
    };
  }

  /**
   * Session History header KPI cards — scoped to the caller's effective
   * viewing session unless `session_id` is passed explicitly.
   */
  async metrics(userId, query = {}) {
    const session = await sessionContext.resolveEffectiveSession(
      userId,
      query.session_id || null
    );
    if (!session) {
      return {
        session: null,
        metrics: {
          exams: null,
          institutions: 0,
          total_candidates: 0,
          current_candidates_enrolled: 0,
          candidates_with_biometrics: 0,
        },
      };
    }

    const metrics = await this._sessionMetrics(session.id);
    const payload = {
      session: {
        id: session.id,
        label: session.academic_year,
        status: session.status,
        opens_at: session.opens_at || null,
        closes_at: session.closes_at || null,
      },
      metrics,
    };

    const previousId = query.previous_session_id;
    if (previousId) {
      if (!isUuid(previousId)) throw httpError(422, 'previous_session_id must be a valid UUID');
      await this.getById(previousId);
      const previousMetrics = await this._sessionMetrics(previousId);
      const prevRow = await sessionModel.findById(previousId);
      payload.compared_to = {
        session_id: previousId,
        label: prevRow?.academic_year || null,
      };
      const deltas = {};
      for (const key of Object.keys(metrics)) {
        if (key === 'exams') continue;
        deltas[key] = computeDelta(metrics[key], previousMetrics[key]);
      }
      payload.deltas = deltas;
    }

    return payload;
  }

  async _statsRaw(id) {
    await this.getById(id);
    let byStatus = {};
    let total = 0;
    let institutionsCount = 0;
    let subjectCombinationsCount = 0;
    let withBio = 0;
    let withoutBio = 0;
    try {
      const result = await pool.query(
        `SELECT status, COUNT(*)::int AS c
         FROM jupeb_registrations
         WHERE session_id = $1
         GROUP BY status`,
        [id]
      );
      for (const r of result.rows) {
        byStatus[r.status] = r.c;
        total += r.c;
      }
      const distinctRows = await pool.query(
        `SELECT
           COUNT(DISTINCT university_id)::int AS institutions_count,
           COUNT(DISTINCT subject_combination_id)::int AS subject_combinations_count
         FROM jupeb_registrations
         WHERE session_id = $1`,
        [id]
      );
      institutionsCount = distinctRows.rows[0].institutions_count;
      subjectCombinationsCount = distinctRows.rows[0].subject_combinations_count;
      const bioRows = await pool.query(
        `SELECT
           SUM(CASE WHEN bio.cnt > 0 THEN 1 ELSE 0 END)::int AS with_bio,
           SUM(CASE WHEN bio.cnt = 0 OR bio.cnt IS NULL THEN 1 ELSE 0 END)::int AS without_bio
         FROM jupeb_registrations r
         LEFT JOIN (
           SELECT registration_id, COUNT(*)::int AS cnt
           FROM jupeb_biometric_captures
           WHERE replaced_at IS NULL
           GROUP BY registration_id
         ) bio ON bio.registration_id = r.id
         WHERE r.session_id = $1`,
        [id]
      );
      withBio = bioRows.rows[0].with_bio || 0;
      withoutBio = bioRows.rows[0].without_bio || 0;
    } catch (e) {
      if (e.code !== '42P01') throw e;
      byStatus = {};
      total = 0;
    }
    return {
      session_id: id,
      total_registrations: total,
      registrations_by_status: byStatus,
      institutions_count: institutionsCount,
      subject_combinations_count: subjectCombinationsCount,
      candidates_with_biometrics: withBio,
      candidates_without_biometrics: withoutBio,
    };
  }

  async exportCsv() {
    const rows = await sessionModel.findAll({ limit: 10000, offset: 0 });
    const header = [
      'id',
      'academic_year',
      'year_short',
      'status',
      'opens_at',
      'closes_at',
      'candidate_info_cutoff_at',
      'profile_update_cutoff_at',
      'ca_cutoff_at',
      'max_ca_score',
      'affiliation_fee_existing',
      'affiliation_fee_new',
      'exam_fee_per_candidate',
      'registration_fee_amount',
      'registration_fee_currency',
      'created_at',
    ];
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(header.map((h) => escape(r[h])).join(','));
    }
    return lines.join('\n');
  }

  async stats(id, query) {
    const current = await this._statsRaw(id);
    const previousId = query && query.previous_session_id;
    if (!previousId) return current;
    const previous = await this._statsRaw(previousId);
    const metrics = [
      'total_registrations',
      'institutions_count',
      'subject_combinations_count',
      'candidates_with_biometrics',
      'candidates_without_biometrics',
    ];
    const deltas = {};
    for (const m of metrics) {
      deltas[m] = computeDelta(current[m], previous[m]);
    }
    return { ...current, previous_session_id: previousId, deltas };
  }
}

function computeDelta(value, previous) {
  const v = Number(value) || 0;
  const p = Number(previous) || 0;
  let pct = null;
  let direction = 'flat';
  if (p === 0 && v === 0) {
    pct = 0;
  } else if (p === 0) {
    pct = null; // undefined growth from zero
    direction = v > 0 ? 'up' : 'flat';
  } else {
    pct = ((v - p) / p) * 100;
    if (Math.abs(pct) < 0.001) direction = 'flat';
    else direction = pct > 0 ? 'up' : 'down';
  }
  return { value: v, previous: p, delta_pct: pct, direction };
}

module.exports = new SessionService();
