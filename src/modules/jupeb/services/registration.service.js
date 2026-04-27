const crypto = require('crypto');
const pool = require('../../../db/pool');
const registrationModel = require('../models/registration.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const universityModel = require('../models/university.model');
const sessionModel = require('../models/session.model');
const { canTransition } = require('./registration-state.service');
const { formatCandidateNumber } = require('../utils/registration-numbering');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');
const {
  assertInstitutionUniversityAccess,
  effectiveInstitutionListUniversityId,
} = require('../utils/institution-scope');
const { emitRegistrationApproved } = require('./registration-events.service');

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

const ROLE_INST_REG = new Set(['program_director', 'institution_admin', 'admin', 'super_admin']);
const ROLE_FINALIZE = new Set(['admin', 'super_admin', 'registrar']);

async function userHasAnyRole(userId, set) {
  const roles = await getUserRoles(userId);
  return roles.some((r) => set.has(r));
}

async function assertInstitutionRegistration(userId) {
  const ok = await userHasAnyRole(userId, ROLE_INST_REG);
  if (!ok) throw httpError(403, 'Forbidden');
}

async function assertFinalizeRole(userId) {
  const ok = await userHasAnyRole(userId, ROLE_FINALIZE);
  if (!ok) throw httpError(403, 'Forbidden');
}

async function assertComboForUniversity(subjectCombinationId, universityId) {
  const combo = await subjectCombinationModel.findById(subjectCombinationId);
  if (!combo || combo.status !== 'active') {
    throw httpError(404, 'Subject combination not found or inactive');
  }
  if (combo.is_global || combo.university_id === universityId) return combo;
  throw httpError(422, 'Subject combination is not available for this university');
}

async function generateUniqueInstitutionCode() {
  for (let i = 0; i < 12; i += 1) {
    const code = crypto.randomBytes(9).toString('hex').slice(0, 16).toUpperCase();
    const existing = await registrationModel.findByInstitutionCode(code);
    if (!existing) return code;
  }
  throw httpError(500, 'Could not allocate institution code');
}

function institutionCodeExpiresAt() {
  const raw = process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS;
  const hours = raw === undefined || raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

function buildProvisionalCandidateCode(yearShort, jupebPrefix, serial) {
  return formatCandidateNumber(yearShort, jupebPrefix, serial);
}

async function transitionStatus(reg, toStatus, { userId, reason, extraFields }) {
  if (!canTransition(reg.status, toStatus)) {
    throw httpError(422, `Cannot transition registration from ${reg.status} to ${toStatus}`);
  }
  const from = reg.status;
  const updated = await registrationModel.updateRegistration(reg.id, {
    status: toStatus,
    ...(extraFields || {}),
  });
  await registrationModel.appendHistory({
    registration_id: reg.id,
    from_status: from,
    to_status: toStatus,
    reason: reason || null,
    changed_by: userId,
  });
  return updated;
}

class RegistrationService {
  async institutionCreate(body, userId) {
    await assertInstitutionRegistration(userId);
    const { session_id, university_id, subject_combination_id, nin_verification_id } = body;
    if (!session_id || !university_id || !subject_combination_id) {
      throw httpError(422, 'session_id, university_id, and subject_combination_id are required');
    }
    if (!isUuid(session_id) || !isUuid(university_id) || !isUuid(subject_combination_id)) {
      throw httpError(422, 'session_id, university_id, and subject_combination_id must be valid UUIDs');
    }
    if (nin_verification_id !== undefined && nin_verification_id !== null) {
      if (!isUuid(nin_verification_id)) throw httpError(422, 'nin_verification_id must be a valid UUID');
    }
    const session = await sessionModel.findById(session_id);
    if (!session) throw httpError(404, 'Session not found');
    if (session.status !== 'open') {
      throw httpError(422, 'Registrations can only be created for an open session');
    }
    const university = await universityModel.findById(university_id);
    if (!university || university.status !== 'active') {
      throw httpError(404, 'University not found or inactive');
    }
    await assertInstitutionUniversityAccess(userId, university_id);
    await assertComboForUniversity(subject_combination_id, university_id);
    const institution_issued_code = await generateUniqueInstitutionCode();
    const provisional_serial = await registrationModel.nextProvisionalSerial(session_id, university_id);
    const provisional_candidate_code = buildProvisionalCandidateCode(
      session.year_short,
      university.jupeb_prefix,
      provisional_serial
    );
    try {
      const row = await registrationModel.insertRegistration({
        session_id,
        university_id,
        user_id: null,
        subject_combination_id,
        nin_verification_id: nin_verification_id || null,
        institution_issued_code,
        provisional_serial,
        provisional_candidate_code,
        status: 'code_issued',
        created_by: userId,
        institution_code_expires_at: institutionCodeExpiresAt(),
      });
      await registrationModel.appendHistory({
        registration_id: row.id,
        from_status: null,
        to_status: 'code_issued',
        reason: null,
        changed_by: userId,
      });
      return row;
    } catch (e) {
      if (e.code === '23505') {
        throw httpError(409, 'Duplicate NIN registration for this session and university');
      }
      throw e;
    }
  }

  async institutionPatch(registrationId, body, userId) {
    await assertInstitutionRegistration(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(userId, reg.university_id);
    const patchable = new Set(['code_issued', 'claimed', 'pending_student_confirm']);
    if (!patchable.has(reg.status)) {
      throw httpError(422, 'Subject combination can no longer be updated for this registration');
    }
    if (body.subject_combination_id === undefined) {
      throw httpError(422, 'subject_combination_id is required');
    }
    if (!isUuid(body.subject_combination_id)) throw httpError(422, 'subject_combination_id must be a valid UUID');
    await assertComboForUniversity(body.subject_combination_id, reg.university_id);
    const updated = await registrationModel.updateRegistration(registrationId, {
      subject_combination_id: body.subject_combination_id,
    });
    return updated;
  }

  async institutionList(query, userId) {
    await assertInstitutionRegistration(userId);
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const { university_id, session_id, status } = query;
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    const rows = await registrationModel.listInstitution({
      university_id: scopedUniversityId,
      session_id: session_id || null,
      status: status || null,
      limit: safeLimit,
      offset,
    });
    const total = await registrationModel.countInstitution({
      university_id: scopedUniversityId,
      session_id: session_id || null,
      status: status || null,
    });
    return { rows, page: safePage, limit: safeLimit, total };
  }

  async institutionApprove(registrationId, userId) {
    await assertInstitutionRegistration(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(userId, reg.university_id);
    if (!canTransition(reg.status, 'approved')) {
      throw httpError(422, 'Registration is not awaiting institution approval');
    }
    const now = new Date().toISOString();
    const updated = await transitionStatus(reg, 'approved', {
      userId,
      reason: null,
      extraFields: {
        dashboard_unlocked_at: now,
        approved_at: now,
        approved_by: userId,
        status_reason: null,
      },
    });
    await emitRegistrationApproved(updated, userId);
    return updated;
  }

  async institutionReject(registrationId, body, userId) {
    await assertInstitutionRegistration(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reason = body && body.reason ? String(body.reason).trim() : '';
    if (!reason) throw httpError(422, 'reason is required');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(userId, reg.university_id);
    if (!canTransition(reg.status, 'rejected')) {
      throw httpError(422, 'Registration cannot be rejected from its current status');
    }
    return transitionStatus(reg, 'rejected', {
      userId,
      reason,
      extraFields: { status_reason: reason },
    });
  }

  async claimCode(body, userId) {
    const code = body && body.institution_issued_code ? String(body.institution_issued_code).trim() : '';
    if (!code) throw httpError(422, 'institution_issued_code is required');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(
        `SELECT * FROM jupeb_registrations WHERE institution_issued_code = $1 FOR UPDATE`,
        [code]
      );
      const reg = lock.rows[0];
      if (!reg) {
        await client.query('ROLLBACK');
        throw httpError(404, 'Registration code not found');
      }
      if (reg.institution_code_expires_at && new Date(reg.institution_code_expires_at).getTime() < Date.now()) {
        await client.query('ROLLBACK');
        throw httpError(410, 'This institution code has expired');
      }
      if (reg.status !== 'code_issued' || reg.user_id) {
        await client.query('ROLLBACK');
        throw httpError(409, 'This code is no longer available');
      }
      const from = reg.status;
      const upd = await client.query(
        `UPDATE jupeb_registrations
         SET user_id = $2, claimed_at = CURRENT_TIMESTAMP, status = 'claimed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'code_issued' AND user_id IS NULL
         RETURNING *`,
        [reg.id, userId]
      );
      const row = upd.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw httpError(409, 'This code is no longer available');
      }
      await client.query(
        `INSERT INTO jupeb_registration_status_history (registration_id, from_status, to_status, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, from, 'claimed', null, userId]
      );
      await client.query('COMMIT');
      return row;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      client.release();
    }
  }

  async getMeCurrent(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    return this._publicRegistrationSummary(reg);
  }

  _publicRegistrationSummary(reg) {
    return {
      id: reg.id,
      session_id: reg.session_id,
      university_id: reg.university_id,
      subject_combination_id: reg.subject_combination_id,
      status: reg.status,
      institution_issued_code: reg.institution_issued_code,
      provisional_candidate_code: reg.provisional_candidate_code,
      jupeb_candidate_number: reg.jupeb_candidate_number,
      claimed_at: reg.claimed_at,
      submitted_at: reg.submitted_at,
      approved_at: reg.approved_at,
      dashboard_unlocked_at: reg.dashboard_unlocked_at,
      payment_projection: reg.payment_projection,
    };
  }

  async confirmSubjects(userId, body) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    if (body && body.subject_combination_id) {
      if (!isUuid(body.subject_combination_id)) throw httpError(422, 'subject_combination_id must be a valid UUID');
      if (!['claimed', 'pending_student_confirm'].includes(reg.status)) {
        throw httpError(422, 'Subject combination cannot be changed at this stage');
      }
      await assertComboForUniversity(body.subject_combination_id, reg.university_id);
      await registrationModel.updateRegistration(reg.id, { subject_combination_id: body.subject_combination_id });
    }
    const fresh = await registrationModel.findById(reg.id);
    if (!['claimed', 'pending_student_confirm'].includes(fresh.status)) {
      throw httpError(422, 'Subject confirmation is not allowed in the current status');
    }
    return transitionStatus(fresh, 'pending_documents', { userId, reason: null, extraFields: {} });
  }

  async submitForReview(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    const now = new Date().toISOString();
    return transitionStatus(reg, 'pending_institution_review', {
      userId,
      reason: null,
      extraFields: { submitted_at: now },
    });
  }

  async getDashboardAccess(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    const unlocked = Boolean(reg.dashboard_unlocked_at);
    return {
      registration_id: reg.id,
      locked: !unlocked,
      unlocked_at: reg.dashboard_unlocked_at,
      status: reg.status,
    };
  }

  async numberingPreview(sessionId, userId) {
    await assertFinalizeRole(userId);
    if (!isUuid(sessionId)) throw httpError(422, 'Invalid session id');
    const session = await sessionModel.findById(sessionId);
    if (!session) throw httpError(404, 'Session not found');
    if (session.status !== 'closed') {
      throw httpError(422, 'numbering-preview requires a closed session');
    }
    const rows = await registrationModel.findApprovedWithoutCandidateNumber(sessionId);
    const proposed = [];
    const seen = new Map();
    const conflicts = [];
    for (const r of rows) {
      const num = formatCandidateNumber(session.year_short, r.university_jupeb_prefix, r.provisional_serial);
      if (seen.has(num)) {
        conflicts.push({ jupeb_candidate_number: num, registration_ids: [seen.get(num), r.id] });
      } else {
        seen.set(num, r.id);
      }
      proposed.push({
        registration_id: r.id,
        university_id: r.university_id,
        provisional_serial: r.provisional_serial,
        proposed_jupeb_candidate_number: num,
      });
    }
    return { session_id: sessionId, proposed, conflicts };
  }

  async finalizeCandidateNumbers(sessionId, userId) {
    await assertFinalizeRole(userId);
    if (!isUuid(sessionId)) throw httpError(422, 'Invalid session id');
    const session = await sessionModel.findById(sessionId);
    if (!session) throw httpError(404, 'Session not found');
    if (session.status !== 'closed') {
      throw httpError(422, 'finalize-candidate-numbers requires a closed session');
    }
    const rows = await registrationModel.findApprovedWithoutCandidateNumber(sessionId);
    let assigned = 0;
    let skipped = 0;
    const numbers = [];
    for (const r of rows) {
      const num = formatCandidateNumber(session.year_short, r.university_jupeb_prefix, r.provisional_serial);
      const updated = await registrationModel.setCandidateNumberIfNull(r.id, num);
      if (updated) {
        assigned += 1;
        numbers.push({ registration_id: r.id, jupeb_candidate_number: num });
      } else {
        skipped += 1;
      }
    }
    await sessionModel.insertEvent(sessionId, 'finalization_completed', { assigned, skipped }, userId);
    return {
      session_id: sessionId,
      assigned,
      skipped,
      numbers,
    };
  }
}

module.exports = new RegistrationService();
