const crypto = require('crypto');
const pool = require('../../../db/pool');
const registrationModel = require('../models/registration.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const universityModel = require('../models/university.model');
const sessionModel = require('../models/session.model');
const ninVerificationModel = require('../models/nin-verification.model');
const biometricCaptureModel = require('../models/biometric-capture.model');
const registrationDocumentModel = require('../models/registration-document.model');
const resultEntriesModel = require('../models/result-entries.model');
const FileService = require('../../files/services/file.service');
const { canTransition } = require('./registration-state.service');
const { formatCandidateNumber, makeInstitutionCode } = require('../utils/registration-numbering');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');
const {
  assertInstitutionUniversityAccess,
  effectiveInstitutionListUniversityId,
} = require('../utils/institution-scope');
const { emitRegistrationApproved } = require('./registration-events.service');
const jupebMailer = require('./jupeb-mailer.service');
const registrationKpi = require('./registration-kpi.service');
const sessionContext = require('./session-context.service');
const submissionService = require('./submission.service');

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

/** Matches `jupeb_reg_status_check` — used to remap mis-sent `bucket` query params. */
const REGISTRATION_RAW_STATUSES = new Set([
  'provisional',
  'code_issued',
  'claimed',
  'pending_student_confirm',
  'pending_documents',
  'pending_institution_review',
  'approved',
  'rejected',
  'withdrawn',
]);

const INSTITUTION_LIST_COARSE_BUCKETS = ['approved', 'pending', 'rejected', 'withdrawn'];

/**
 * UI sometimes sends a raw workflow status as `bucket`. Coerce to `status`
 * so `_buildInstitutionWhere` can apply an exact match. Prefer explicit `status`
 * when both are set and disagree.
 */
function normalizeInstitutionListFilters(query) {
  const q = query || {};
  let status = q.status != null && String(q.status).trim() !== '' ? String(q.status).trim() : null;
  let bucket = q.bucket != null && String(q.bucket).trim() !== '' ? String(q.bucket).trim() : null;

  if (bucket && !INSTITUTION_LIST_COARSE_BUCKETS.includes(bucket)) {
    if (REGISTRATION_RAW_STATUSES.has(bucket)) {
      if (!status) {
        status = bucket;
        bucket = null;
      } else if (status === bucket) {
        bucket = null;
      } else {
        throw httpError(
          422,
          'bucket and status conflict: use status for exact workflow filters (e.g. pending_institution_review)'
        );
      }
    } else {
      throw httpError(
        422,
        `bucket must be one of ${INSTITUTION_LIST_COARSE_BUCKETS.join(', ')} or a valid registration status for exact filtering`
      );
    }
  }

  if (bucket && !INSTITUTION_LIST_COARSE_BUCKETS.includes(bucket)) {
    throw httpError(422, `bucket must be one of ${INSTITUTION_LIST_COARSE_BUCKETS.join(', ')}`);
  }
  if (status && REGISTRATION_RAW_STATUSES.has(status) === false) {
    throw httpError(422, 'status must be a valid registration workflow value');
  }

  return { ...q, status, bucket };
}

const ROLE_INST_REG = new Set(['program_director', 'institution_admin', 'registrar', 'admin', 'super_admin']);
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

/**
 * Shared M.2 profile patch: validates body against NIN-immutable rules and
 * updates `profiles` + `users` in one transaction. Used by student self-service
 * and institution candidate edit.
 */
async function applyUserProfilePatch(targetUserId, body, ninPayload) {
  if (!body || typeof body !== 'object') throw httpError(422, 'Body is required');

  const errors = [];
  const NIN_IMMUTABLE = ['date_of_birth', 'gender', 'first_name', 'last_name', 'name', 'middle_name'];
  for (const field of NIN_IMMUTABLE) {
    if (body[field] !== undefined && ninPayload && Object.prototype.hasOwnProperty.call(ninPayload, field)) {
      const incoming = String(body[field] || '').toLowerCase().trim();
      const onFile = String(ninPayload[field] || '').toLowerCase().trim();
      if (incoming && incoming !== onFile) {
        errors.push({ field, error_code: 'nin_field_immutable' });
      }
    }
  }

  const editable = {
    title: body.title !== undefined ? String(body.title || '').trim() : undefined,
    residential_address:
      body.residential_address !== undefined ? String(body.residential_address || '').trim() : undefined,
    state_of_origin:
      body.state_of_origin !== undefined ? String(body.state_of_origin || '').trim() : undefined,
    lga: body.lga !== undefined ? String(body.lga || '').trim() : undefined,
    place_of_birth:
      body.place_of_birth !== undefined ? String(body.place_of_birth || '').trim() : undefined,
  };
  const phone = body.phone !== undefined ? String(body.phone || '').trim() : undefined;
  const email = body.email !== undefined ? String(body.email || '').trim() : undefined;

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push({ field: 'email', error_code: 'invalid_email' });
  }
  if (phone && phone.length < 6) {
    errors.push({ field: 'phone', error_code: 'phone_too_short' });
  }

  if (errors.length) {
    const err = httpError(422, 'Profile update rejected');
    err.details = { errors };
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const profileFields = Object.entries(editable).filter(([, v]) => v !== undefined);
    if (profileFields.length) {
      await client.query(
        `INSERT INTO profiles (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [targetUserId]
      );
      const setSql = profileFields.map(([k], idx) => `${k} = $${idx + 2}`).join(', ');
      const values = profileFields.map(([, v]) => (v === '' ? null : v));
      await client.query(
        `UPDATE profiles
            SET ${setSql}, updated_at = NOW()
          WHERE user_id = $1`,
        [targetUserId, ...values]
      );
    }

    if (phone !== undefined) {
      await client.query(`UPDATE users SET phone = $2, updated_at = NOW() WHERE id = $1`, [
        targetUserId,
        phone === '' ? null : phone,
      ]);
    }
    if (email !== undefined && email) {
      const dup = await client.query(`SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1`, [
        email,
        targetUserId,
      ]);
      if (dup.rows.length) {
        throw httpError(409, 'Email already in use');
      }
      await client.query(`UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1`, [
        targetUserId,
        email,
      ]);
    }

    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Translate a raw registration status into the coarse bucket the
 * frontend filters / displays by. The raw `status` is always kept
 * alongside this on responses.
 */
function statusBucket(status) {
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  if (status === 'withdrawn') return 'withdrawn';
  return 'pending';
}

/**
 * Shape an enriched institution-list row for the dashboard. Joins are done
 * in the model query; here we just project to a compact response shape.
 */
function enrichListRow(row) {
  if (!row) return row;
  const intakeName = row.nin_intake_name ? String(row.nin_intake_name).trim() : '';
  const ninFromPayload = row.nin_display_name ? String(row.nin_display_name).trim() : '';
  const fullName =
    row.display_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    (intakeName || null) ||
    (ninFromPayload || null) ||
    null;
  const biometric_status =
    row.has_face && row.has_fingerprint
      ? 'yes'
      : row.has_face || row.has_fingerprint
      ? 'partial'
      : 'no';
  const ninEmail = row.nin_intake_email ? String(row.nin_intake_email).trim() : '';
  const candidate = {
    id: row.user_id || null,
    name: fullName,
    email: (row.user_email && String(row.user_email).trim()) || (ninEmail || null) || null,
    candidate_id:
      row.jupeb_candidate_number ||
      row.provisional_candidate_code ||
      row.institution_issued_code ||
      null,
  };
  const university = row.uni_id
    ? { id: row.uni_id, name: row.uni_name, short_name: row.uni_short_name }
    : null;

  return {
    id: row.id,
    session_id: row.session_id,
    university_id: row.university_id,
    subject_combination_id: row.subject_combination_id,
    nin_verification_id: row.nin_verification_id,
    institution_issued_code: row.institution_issued_code,
    provisional_candidate_code: row.provisional_candidate_code,
    jupeb_candidate_number: row.jupeb_candidate_number,
    status: row.status,
    bucket: statusBucket(row.status),
    sittings_count: row.sittings_count,
    result_types: row.result_types,
    claimed_at: row.claimed_at,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    candidate,
    university,
    biometric_status,
  };
}

/**
 * Attach the full `subject_combination` object (the combination row plus
 * its `subject_items[]`) to a batch of enriched list rows — one query
 * for the combinations, one for the items, regardless of page size.
 * Each row keeps its raw `subject_combination_id` and gains
 * `subject_combination`.
 */
async function attachSubjectCombinations(rows) {
  const ids = [...new Set(rows.map((r) => r.subject_combination_id).filter(Boolean))];
  if (!ids.length) {
    rows.forEach((r) => { r.subject_combination = null; });
    return rows;
  }
  const [combos, itemsMap] = await Promise.all([
    subjectCombinationModel.findByIds(ids),
    subjectCombinationModel.listItemsForCombinations(ids),
  ]);
  const comboMap = new Map(combos.map((c) => [c.id, c]));
  for (const r of rows) {
    const combo = r.subject_combination_id ? comboMap.get(r.subject_combination_id) : null;
    r.subject_combination = combo
      ? { ...combo, subject_items: itemsMap.get(combo.id) || [] }
      : null;
  }
  return rows;
}

async function generateUniqueInstitutionCode() {
  for (let i = 0; i < 24; i += 1) {
    const code = makeInstitutionCode();
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

async function loadNinVerificationSummary(reg) {
  if (!reg || !reg.nin_verification_id) return null;
  const row = await ninVerificationModel.findById(reg.nin_verification_id);
  if (!row) return null;
  return { id: row.id, status: row.status };
}

/**
 * Full NIN row fields needed to mirror `getMeProfile` merge rules on the
 * institution candidate-detail endpoint (M.2 parity with submission preview).
 */
async function loadNinVerificationForInstitutionDetail(reg) {
  if (!reg || !reg.nin_verification_id) {
    return { nin_verification: null, ninPayload: {}, intake: {} };
  }
  const row = await ninVerificationModel.findById(reg.nin_verification_id);
  if (!row) return { nin_verification: null, ninPayload: {}, intake: {} };
  return {
    nin_verification: { id: row.id, status: row.status },
    ninPayload: row.response_payload || {},
    intake: row.intake_payload || {},
  };
}

/**
 * Same field precedence as `getMeProfile` so institution GET matches
 * `GET /registration/me/submission-preview` for NIN-backed demographics.
 */
function mergeInstitutionCandidateFromNin(candidateRow, ninPayload, intake) {
  if (!candidateRow) return null;
  const u = candidateRow;
  const n = ninPayload || {};
  const i = intake || {};
  const first_name = u.first_name || n.first_name || null;
  const last_name = u.last_name || n.last_name || null;
  const display_name =
    u.display_name
    || [first_name, last_name].filter(Boolean).join(' ').trim()
    || (i.name ? String(i.name).trim() : null)
    || [n.first_name, n.last_name].filter(Boolean).join(' ').trim()
    || null;
  return {
    id: u.id,
    email: u.email || i.email || null,
    phone: u.phone || i.phone || n.phone || null,
    email_verified: u.email_verified,
    phone_verified: u.phone_verified,
    last_login_at: u.last_login_at,
    first_name,
    last_name,
    display_name,
    date_of_birth: n.date_of_birth || u.date_of_birth || null,
    gender: n.gender || u.gender || null,
    profile_photo_url: n.photo_url || u.profile_photo_url || null,
    residential_address: u.residential_address || n.address || null,
    state_of_origin: u.state_of_origin || n.state_of_origin || null,
    lga: u.lga || n.lga || null,
    place_of_birth: u.place_of_birth || n.place_of_birth || null,
  };
}

function institutionNextOfKinFromNinPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name =
    raw.name
    || raw.full_name
    || [raw.first_name, raw.middle_name, raw.last_name]
      .filter((x) => x && String(x).trim())
      .map((x) => String(x).trim())
      .join(' ')
    || null;
  const phone = raw.phone || raw.contact || raw.contact_no || null;
  return {
    name,
    relationship: raw.relationship || raw.relation || null,
    phone,
    email: raw.email || null,
    address: raw.address || null,
    source: 'nin',
  };
}

async function loadDisplayObjects(reg) {
  if (!reg) return {};
  const [combo, university, session] = await Promise.all([
    reg.subject_combination_id ? subjectCombinationModel.findById(reg.subject_combination_id) : null,
    reg.university_id ? universityModel.findById(reg.university_id) : null,
    reg.session_id ? sessionModel.findById(reg.session_id) : null,
  ]);
  // Embed the combination's constituent subjects so clients get the full
  // object — no follow-up GET /catalog/subject-combinations/:id needed.
  const subjectItems = combo ? await subjectCombinationModel.listItems(combo.id) : [];
  return {
    subject_combination: combo
      ? { ...combo, subject_items: subjectItems }
      : null,
    university: university
      ? {
        id: university.id,
        name: university.name,
        short_name: university.short_name,
        jupeb_prefix: university.jupeb_prefix,
      }
      : null,
    session: session ? { id: session.id, academic_year: session.academic_year, year_short: session.year_short } : null,
  };
}

async function serializeRegistration(reg) {
  if (!reg) return reg;
  const [nin_verification, displays] = await Promise.all([
    loadNinVerificationSummary(reg),
    loadDisplayObjects(reg),
  ]);
  return { ...reg, nin_verification, ...displays };
}

async function assertNinVerified(reg) {
  if (!reg.nin_verification_id) return;
  const row = await ninVerificationModel.findById(reg.nin_verification_id);
  if (!row) throw httpError(422, 'Linked NIN verification not found');
  if (row.status !== 'verified') {
    throw httpError(422, `Cannot approve while NIN verification is ${row.status}`);
  }
}

/**
 * Best-effort mapping of generic httpError instances to a stable
 * `error_code` string for batch-action responses. Errors that already carry
 * `details.error_code` use that directly upstream; this is the fallback.
 */
function mapErrorCode(err) {
  if (!err) return 'unknown';
  const status = err.status || 500;
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 422) {
    const m = err.message || '';
    if (/cannot transition/i.test(m)) return 'invalid_transition';
    if (/awaiting institution approval/i.test(m)) return 'invalid_transition';
    if (/cannot be rejected/i.test(m)) return 'invalid_transition';
    if (/cannot be withdrawn/i.test(m)) return 'invalid_transition';
    if (/nin/i.test(m) && /verified/i.test(m)) return 'nin_not_verified';
    if (/reason is required/i.test(m)) return 'reason_required';
    return 'unprocessable';
  }
  if (status === 409) return 'conflict';
  return `http_${status}`;
}

const TERMINAL_STATUSES = new Set(['approved', 'rejected', 'withdrawn']);

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

  // Terminal status → snapshot NIN-backed demographics into profiles / NoK,
  // then purge the cached NIN profile (PII) on the verification row so cache
  // lookups miss and a later verifyNin can hit the provider fresh.
  // Snapshot runs first so institution/student UIs still read durable tables
  // after `response_payload` is cleared. Best-effort: failures must not block
  // the status transition.
  if (TERMINAL_STATUSES.has(toStatus) && reg.nin_verification_id) {
    try {
      const ninRow = await ninVerificationModel.findById(reg.nin_verification_id);
      if (ninRow && ninRow.response_payload && typeof ninRow.response_payload === 'object') {
        // eslint-disable-next-line global-require
        const { applyNinPayloadToRegistration } = require('./nin-write-through.service');
        await applyNinPayloadToRegistration({
          registrationId: reg.id,
          ninPayload: ninRow.response_payload,
          userId,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[transitionStatus] NIN snapshot write-through failed for registration',
        reg.id, err && err.message
      );
    }
    try {
      await ninVerificationModel.clearById(reg.nin_verification_id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[transitionStatus] NIN cache clear failed for verification',
        reg.nin_verification_id, err && err.message
      );
    }
  }

  // Fire lifecycle emails for rejected / withdrawn here. Approved is
  // handled separately in emitRegistrationApproved (which also writes
  // an in-app notification + webhook). All sends are best-effort and
  // deferred via setImmediate so the DB lookups in the mailer never
  // share the request-handler's microtask tail.
  if (toStatus === 'rejected') {
    setImmediate(() => { jupebMailer.sendRegistrationRejected(reg.id, reason); });
  } else if (toStatus === 'withdrawn') {
    setImmediate(() => { jupebMailer.sendRegistrationWithdrawn(reg.id, reason); });
  }
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

      // M.12 — write NIN payload through to NoK + profile address (best-effort).
      if (row.nin_verification_id) {
        try {
          const ninRow = await ninVerificationModel.findById(row.nin_verification_id);
          if (ninRow && ninRow.status === 'verified') {
            // eslint-disable-next-line global-require
            const { applyNinPayloadToRegistration } = require('./nin-write-through.service');
            await applyNinPayloadToRegistration({
              registrationId: row.id,
              ninPayload: ninRow.response_payload || {},
              userId,
            });
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[institutionCreate] NIN write-through failed for', row.id, err && err.message);
        }
      }

      setImmediate(() => { jupebMailer.sendCodeIssued(row.id); });

      return serializeRegistration(row);
    } catch (e) {
      if (e.code === '23505') {
        throw httpError(409, 'Duplicate NIN registration for this session and university');
      }
      throw e;
    }
  }

  /**
   * Single-call candidate detail for the institution dashboard.
   *
   * Composes everything an institution reviewer needs onto one page:
   *   - registration + status history
   *   - candidate user + profile (name, email, phone, address fields)
   *   - subject combination + university + session
   *   - NIN verification snapshot
   *   - documents (uploaded + per-doc status)
   *   - result entries grouped by (source, sitting)
   *   - biometric captures + skip flags
   *   - next-of-kin (from `jupeb_next_of_kin` or cleared NIN payload fallback)
   *
   * After approval, NIN `response_payload` is cleared; demographics and NoK
   * are read from `profiles` / `jupeb_next_of_kin` (snapshotted at terminal transition).
   * Response includes `session_id`, `university_id`, and `subject_combination_id`.
   *
   * Auth: institution-write role + university scope on the row.
   */
  async institutionGetCandidate(registrationId, userId) {
    await assertInstitutionRegistration(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(userId, reg.university_id);

    // Pull related rows in parallel. Each model returns null/[] when
    // there's nothing — the detail page renders graceful empty states.
    const nokModel = require('../models/next-of-kin.model');

    const [
      displays,
      ninBundle,
      candidate,
      biometrics,
      next_of_kin,
      documentsRaw,
      result_entries,
      history,
    ] = await Promise.all([
      loadDisplayObjects(reg),
      loadNinVerificationForInstitutionDetail(reg),
      reg.user_id ? pool.query(
        `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified,
                u.last_login_at,
                p.first_name, p.last_name, p.display_name,
                p.date_of_birth, p.gender, p.profile_photo_url,
                p.residential_address, p.state_of_origin, p.lga, p.place_of_birth
           FROM users u LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1 LIMIT 1`,
        [reg.user_id]
      ).then((r) => r.rows[0] || null) : Promise.resolve(null),
      biometricCaptureModel.findByRegistrationId(reg.id).catch(() => []),
      Promise.resolve()
        .then(() => nokModel.findActiveByRegistration(reg.id))
        .catch(() => null),
      registrationDocumentModel.findByRegistration(reg.id).catch(() => []),
      resultEntriesModel.findByRegistration(reg.id).catch(() => []),
      pool.query(
        `SELECT from_status, to_status, reason, changed_by, created_at
           FROM jupeb_registration_status_history
          WHERE registration_id = $1
          ORDER BY created_at ASC`,
        [reg.id]
      ).then((r) => r.rows).catch(() => []),
    ]);

    const fileOwnerId = reg.user_id || null;
    const documents = await Promise.all(
      (documentsRaw || []).map(async (d) => {
        let download_url = null;
        if (d.file_id && fileOwnerId) {
          try {
            const file = await FileService.getFile(d.file_id, fileOwnerId);
            download_url = file ? file.file_url : null;
          } catch {
            download_url = null;
          }
        }
        return {
          id: d.id,
          requirement_id: d.requirement_id,
          status: d.status,
          file_id: d.file_id,
          source: d.source,
          sitting: d.sitting,
          download_url,
          review_note: d.review_note || null,
          reviewed_at: d.reviewed_at || null,
          reviewed_by: d.reviewed_by || null,
          created_at: d.created_at,
          updated_at: d.updated_at,
        };
      })
    );

    const biometricsOut = await Promise.all(
      (biometrics || []).map(async (b) => {
        let preview_url = null;
        if (b.file_id && fileOwnerId) {
          try {
            const file = await FileService.getFile(b.file_id, fileOwnerId);
            preview_url = file ? file.file_url : null;
          } catch {
            preview_url = null;
          }
        }
        return {
          id: b.id,
          capture_type: b.capture_type,
          quality_score: b.quality_score,
          captured_at: b.captured_at,
          external_reference: b.external_reference || null,
          file_id: b.file_id || null,
          preview_url,
        };
      })
    );

    const { nin_verification, ninPayload, intake } = ninBundle;
    const mergedCandidate = mergeInstitutionCandidateFromNin(candidate, ninPayload, intake);
    let next_of_kin_response = null;
    if (next_of_kin) {
      next_of_kin_response = {
        name: next_of_kin.name,
        relationship: next_of_kin.relationship,
        phone: next_of_kin.phone,
        email: next_of_kin.email,
        address: next_of_kin.address,
        source: next_of_kin.source,
      };
    } else {
      const fromNin = institutionNextOfKinFromNinPayload(ninPayload.next_of_kin);
      if (fromNin && (fromNin.name || fromNin.phone || fromNin.email)) {
        next_of_kin_response = fromNin;
      }
    }
    const captureTypes = new Set((biometrics || []).map((b) => b.capture_type).filter(Boolean));
    const skipped = {
      face: !!reg.face_skipped_at,
      fingerprint: !!reg.fingerprint_skipped_at,
    };
    const hasFace = captureTypes.has('face') || skipped.face;
    const hasFinger = captureTypes.has('fingerprint') || skipped.fingerprint;
    const biometric_status = hasFace && hasFinger ? 'yes' : (hasFace || hasFinger ? 'partial' : 'no');

    return {
      id: reg.id,
      session_id: reg.session_id,
      university_id: reg.university_id,
      subject_combination_id: reg.subject_combination_id,
      status: reg.status,
      bucket: statusBucket(reg.status),
      status_reason: reg.status_reason || null,
      institution_issued_code: reg.institution_issued_code,
      institution_code_expires_at: reg.institution_code_expires_at,
      provisional_candidate_code: reg.provisional_candidate_code,
      jupeb_candidate_number: reg.jupeb_candidate_number,
      claimed_at: reg.claimed_at,
      submitted_at: reg.submitted_at,
      approved_at: reg.approved_at,
      approved_by: reg.approved_by,
      dashboard_unlocked_at: reg.dashboard_unlocked_at,
      created_at: reg.created_at,
      updated_at: reg.updated_at,
      nin_verification_id: reg.nin_verification_id,
      ...displays,
      nin_verification,
      candidate: mergedCandidate,
      next_of_kin: next_of_kin_response,
      documents,
      result_entries: result_entries || [],
      biometrics: biometricsOut,
      biometric_status,
      biometric_skips: skipped,
      status_history: history || [],
    };
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

  /**
   * Institution M.2 — patch candidate profile, subject combination, and/or documents for a claimed registration.
   * Profile fields follow the same rules as `PATCH /registration/me/profile` (NIN-immutable fields).
   * Optional `subject_combination_id` updates `jupeb_registrations` when the combo is active and allowed for the university.
   * Optional `documents` is a non-empty array of `{ document_id, file_id }` (replace submitted row) or
   * `{ requirement_id, file_id, source?, sitting? }` (attach; same duplicate rules as student POST).
   */
  async institutionPatchCandidate(registrationId, body, actorUserId) {
    await assertInstitutionRegistration(actorUserId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(actorUserId, reg.university_id);
    if (!reg.user_id) {
      throw httpError(422, 'Candidate profile cannot be edited until the registration code is claimed');
    }
    const editableStatuses = new Set([
      'claimed',
      'pending_student_confirm',
      'pending_documents',
      'pending_institution_review',
    ]);
    if (!editableStatuses.has(reg.status)) {
      throw httpError(422, 'Candidate profile cannot be edited in the current registration status');
    }

    let ninPayload = {};
    if (reg.nin_verification_id) {
      const ninRow = await ninVerificationModel.findById(reg.nin_verification_id);
      if (ninRow && ninRow.status === 'verified') {
        ninPayload = ninRow.response_payload || {};
      }
    }

    await applyUserProfilePatch(reg.user_id, body, ninPayload);

    if (body.subject_combination_id !== undefined && body.subject_combination_id !== null) {
      const scid = String(body.subject_combination_id).trim();
      if (!isUuid(scid)) throw httpError(422, 'subject_combination_id must be a valid UUID');
      await assertComboForUniversity(scid, reg.university_id);
      await registrationModel.updateRegistration(registrationId, {
        subject_combination_id: scid,
      });
    }

    if (body.documents !== undefined && body.documents !== null) {
      if (!Array.isArray(body.documents)) {
        throw httpError(422, 'documents must be an array');
      }
      if (body.documents.length) {
        await submissionService.institutionReuploadDocuments(
          actorUserId,
          reg.id,
          body.documents,
          reg.user_id
        );
      }
    }

    return this.institutionGetCandidate(registrationId, actorUserId);
  }

  /**
   * Re-send the institution-issued registration code email (same template as create).
   * Does not rotate the code or extend expiry.
   */
  async institutionResendCode(registrationId, actorUserId) {
    await assertInstitutionRegistration(actorUserId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(actorUserId, reg.university_id);
    if (reg.status !== 'code_issued') {
      throw httpError(422, 'Registration code can only be resent while the registration is awaiting claim');
    }
    if (reg.user_id) {
      throw httpError(422, 'Registration code was already claimed');
    }
    if (reg.institution_code_expires_at && new Date(reg.institution_code_expires_at).getTime() < Date.now()) {
      const err = httpError(410, 'This institution code has expired');
      err.details = {
        error_code: 'code_expired',
        expires_at: reg.institution_code_expires_at,
      };
      throw err;
    }
    setImmediate(() => {
      jupebMailer.sendCodeIssued(registrationId);
    });
    return {
      id: reg.id,
      institution_issued_code: reg.institution_issued_code,
      institution_code_expires_at: reg.institution_code_expires_at,
      resent: true,
    };
  }

  async institutionList(query, userId) {
    await assertInstitutionRegistration(userId);
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const norm = normalizeInstitutionListFilters(query);
    const { university_id, session_id, status, bucket, q } = norm;
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    const effectiveSession = await sessionContext.resolveEffectiveSession(userId, session_id || null);
    const filters = {
      university_id: scopedUniversityId,
      session_id: session_id || effectiveSession?.id || null,
      status: status || null,
      bucket: bucket || null,
      q: q || null,
    };
    const rows = await registrationModel.listInstitution({
      ...filters,
      limit: safeLimit,
      offset,
    });
    const total = await registrationModel.countInstitution(filters);
    const enriched = await attachSubjectCombinations(rows.map(enrichListRow));
    return {
      rows: enriched,
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  /**
   * E.4 — KPI counts for the figma "Total Registered / Pending / Approved /
   * Rejected / With biometrics" cards plus **distinct subject combinations** in session.
   * Scoped to the caller's institution. Adds per-metric `value` + `delta_pct` + `trend` vs
   * previous session and `compared_to` using the same KPI definitions as the program dashboard.
   */
  async institutionStats(query, userId) {
    await assertInstitutionRegistration(userId);
    const { university_id, session_id } = query || {};
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);

    const currentSession = await sessionContext.resolveEffectiveSession(userId, session_id || null);
    if (!currentSession) {
      const emptyGrowth = {
        total_registered: { value: 0, delta_pct: null, trend: null },
        approved: { value: 0, delta_pct: null, trend: null },
        pending: { value: 0, delta_pct: null, trend: null },
        rejected: { value: 0, delta_pct: null, trend: null },
        with_biometrics: { value: 0, delta_pct: null, trend: null },
        total_subject_combinations: { value: 0, delta_pct: null, trend: null },
      };
      return {
        ...emptyGrowth,
        compared_to: null,
      };
    }

    const previousSession = await registrationKpi.findPreviousRegistrationSession(currentSession);
    const cur = await registrationKpi.kpiCounts(scopedUniversityId, currentSession.id);
    const prev = previousSession
      ? await registrationKpi.kpiCounts(scopedUniversityId, previousSession.id)
      : null;
    const d = registrationKpi.deltaPct;
    const t = registrationKpi.growthTrend;
    const card = (curVal, prevVal) => ({
      value: curVal,
      delta_pct: prev ? d(curVal, prevVal) : null,
      trend: prev ? t(curVal, prevVal) : null,
    });

    return {
      total_registered: card(cur.total, prev?.total),
      approved: card(cur.approved, prev?.approved),
      pending: card(cur.pending, prev?.pending),
      rejected: card(cur.rejected, prev?.rejected),
      with_biometrics: card(cur.biometric, prev?.biometric),
      total_subject_combinations: card(
        cur.total_subject_combinations,
        prev?.total_subject_combinations
      ),
      compared_to: previousSession ? { session_id: previousSession.id, label: previousSession.academic_year } : null,
    };
  }

  /**
   * E.5 — top-N institutions bar chart. Defaults to top 12 (figma uses 12 bars).
   */
  async institutionByUniversity(query, userId) {
    await assertInstitutionRegistration(userId);
    const { session_id, university_id, limit } = query || {};
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const effectiveSession = await sessionContext.resolveEffectiveSession(userId, session_id || null);
    return registrationModel.byUniversity({
      session_id: session_id || effectiveSession?.id || null,
      university_id: scopedUniversityId,
      limit: safeLimit,
    });
  }

  /**
   * E.6 — CSV export. Returns the full CSV body as a string. The result set
   * is capped at 10k rows to keep memory bounded; client should narrow the
   * filters for larger exports.
   */
  async institutionExportCsv(query, userId) {
    await assertInstitutionRegistration(userId);
    const norm = normalizeInstitutionListFilters(query || {});
    const { university_id, session_id, status, bucket, q } = norm;
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    const effectiveSession = await sessionContext.resolveEffectiveSession(userId, session_id || null);
    const filters = {
      university_id: scopedUniversityId,
      session_id: session_id || effectiveSession?.id || null,
      status: status || null,
      bucket: bucket || null,
      q: q || null,
    };
    const rows = await registrationModel.listInstitution({
      ...filters,
      limit: 10000,
      offset: 0,
    });
    const enrichedRows = await attachSubjectCombinations(rows.map(enrichListRow));

    const headers = [
      'candidate_id',
      'name',
      'email',
      'university',
      'subject_combination',
      'sittings_count',
      'status',
      'biometric_status',
      'institution_issued_code',
      'jupeb_candidate_number',
      'provisional_candidate_code',
      'created_at',
      'submitted_at',
      'approved_at',
    ];

    const csvEscape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines = [headers.join(',')];
    for (const enriched of enrichedRows) {
      const candidate = enriched.candidate || {};
      const sc = enriched.subject_combination;
      const subjectLabel = sc
        ? [
          [sc.code, sc.title].filter(Boolean).join(' — '),
          (sc.subject_items || []).map((it) => it.code || it.name).filter(Boolean).join(' | '),
        ].filter(Boolean).join(' | ')
        : '';
      lines.push([
        candidate.candidate_id,
        candidate.name,
        candidate.email,
        enriched.university && enriched.university.name,
        subjectLabel,
        enriched.sittings_count,
        enriched.status,
        enriched.biometric_status,
        enriched.institution_issued_code,
        enriched.jupeb_candidate_number,
        enriched.provisional_candidate_code,
        enriched.created_at && enriched.created_at.toISOString && enriched.created_at.toISOString(),
        enriched.submitted_at && enriched.submitted_at.toISOString && enriched.submitted_at.toISOString(),
        enriched.approved_at && enriched.approved_at.toISOString && enriched.approved_at.toISOString(),
      ].map(csvEscape).join(','));
    }
    return lines.join('\n') + '\n';
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
    await assertNinVerified(reg);
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
    return serializeRegistration(updated);
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
    const updated = await transitionStatus(reg, 'rejected', {
      userId,
      reason,
      extraFields: { status_reason: reason },
    });
    return serializeRegistration(updated);
  }

  /**
   * E.8 — withdraw a registration. Allowed from any non-terminal state per the
   * registration-state machine.
   */
  async institutionWithdraw(registrationId, body, userId) {
    await assertInstitutionRegistration(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reason = body && body.reason ? String(body.reason).trim() : '';
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(userId, reg.university_id);
    if (!canTransition(reg.status, 'withdrawn')) {
      throw httpError(422, `Registration cannot be withdrawn from status ${reg.status}`);
    }
    const updated = await transitionStatus(reg, 'withdrawn', {
      userId,
      reason: reason || null,
      extraFields: { status_reason: reason || null },
    });
    return serializeRegistration(updated);
  }

  /**
   * Hard-delete a registration row (not the institution). Allowed only for
   * `rejected`, `withdrawn`, or `code_issued` with no linked student (`user_id` null).
   */
  async institutionDeleteRegistration(registrationId, userId) {
    await assertInstitutionRegistration(userId);
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const reg = await registrationModel.findById(registrationId);
    if (!reg) throw httpError(404, 'Registration not found');
    await assertInstitutionUniversityAccess(userId, reg.university_id);

    const unclaimedCode = reg.status === 'code_issued' && !reg.user_id;
    const allowed = unclaimedCode || reg.status === 'rejected' || reg.status === 'withdrawn';
    if (!allowed) {
      throw httpError(
        422,
        'Registration can only be deleted when rejected, withdrawn, or still an unclaimed code (code_issued with no linked student)'
      );
    }

    const deleted = await registrationModel.deleteRegistration(registrationId);
    if (!deleted) throw httpError(404, 'Registration not found');
    return { id: registrationId, deleted: true };
  }

  /**
   * E.7 — batch approve / reject / withdraw / delete. Loops over rows and applies the
   * per-row guards from the existing single-row endpoints. Never short-circuits
   * on first failure: every id gets a verdict, returned as
   *   { accepted: [{ id, status }], rejected: [{ id, error_code, message, http_status }], action }.
   *
   * Body: { ids: [uuid, ...], action: 'approve'|'reject'|'withdraw'|'delete', reason?: string }
   *   - approve: no reason required.
   *   - reject:  reason required.
   *   - withdraw: reason optional.
   *   - delete: no reason required (hard-delete; see single-row delete for guards).
   */
  async institutionBatchAction(body, userId) {
    await assertInstitutionRegistration(userId);
    const ids = Array.isArray(body && body.ids) ? body.ids : [];
    const action = body && body.action ? String(body.action).toLowerCase().trim() : '';
    const reason = body && body.reason ? String(body.reason).trim() : '';

    if (!ids.length) {
      throw httpError(422, 'ids[] is required');
    }
    if (ids.length > 100) {
      throw httpError(422, 'ids[] cannot exceed 100 entries per request');
    }
    if (!['approve', 'reject', 'withdraw', 'delete'].includes(action)) {
      throw httpError(422, 'action must be one of approve, reject, withdraw, delete');
    }
    if (action === 'reject' && !reason) {
      throw httpError(422, 'reason is required when action is reject');
    }
    for (const id of ids) {
      if (!isUuid(id)) throw httpError(422, `Invalid registration id in ids[]: ${id}`);
    }

    const accepted = [];
    const rejected = [];

    for (const id of ids) {
      try {
        if (action === 'approve') {
          const updated = await this.institutionApprove(id, userId);
          accepted.push({ id, status: updated && updated.status });
        } else if (action === 'reject') {
          const updated = await this.institutionReject(id, { reason }, userId);
          accepted.push({ id, status: updated && updated.status });
        } else if (action === 'withdraw') {
          const updated = await this.institutionWithdraw(id, { reason }, userId);
          accepted.push({ id, status: updated && updated.status });
        } else {
          await this.institutionDeleteRegistration(id, userId);
          accepted.push({ id, status: 'deleted' });
        }
      } catch (err) {
        rejected.push({
          id,
          error_code: (err.details && err.details.error_code) || mapErrorCode(err),
          message: err.message,
          http_status: err.status || 500,
        });
      }
    }

    return { accepted, rejected, action };
  }

  async getCodeStatus(rawCode) {
    const code = rawCode ? String(rawCode).trim() : '';
    if (!code) {
      return { valid: false, error_code: 'code_required' };
    }
    const reg = await registrationModel.findByInstitutionCode(code);
    if (!reg) {
      return { valid: false, error_code: 'code_not_found' };
    }
    if (reg.status !== 'code_issued' || reg.user_id) {
      return { valid: false, error_code: 'code_already_used', expires_at: reg.institution_code_expires_at };
    }
    if (reg.institution_code_expires_at && new Date(reg.institution_code_expires_at).getTime() < Date.now()) {
      return {
        valid: false,
        error_code: 'code_expired',
        expires_at: reg.institution_code_expires_at,
      };
    }
    let university = null;
    if (reg.university_id) {
      const u = await universityModel.findById(reg.university_id);
      if (u) university = { id: u.id, name: u.name, jupeb_prefix: u.jupeb_prefix };
    }
    return {
      valid: true,
      expires_at: reg.institution_code_expires_at,
      university_name: university ? university.name : null,
      university,
    };
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
        const err = httpError(410, 'This institution code has expired');
        err.details = {
          error_code: 'code_expired',
          expires_at: reg.institution_code_expires_at,
        };
        throw err;
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

  async updateAcademicIntake(userId, body) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    const sittings = Number(body && body.sittings_count);
    if (![1, 2].includes(sittings)) {
      throw httpError(422, 'sittings_count must be 1 or 2');
    }
    const types = Array.isArray(body && body.result_types) ? body.result_types : [];
    const allowedTypes = new Set(['waec', 'neco', 'gce', 'nabteb']);
    const cleaned = [...new Set(types.map((t) => String(t).toLowerCase().trim()))]
      .filter((t) => allowedTypes.has(t));
    if (cleaned.length === 0) {
      throw httpError(422, 'result_types must include at least one of: waec, neco, gce, nabteb');
    }
    return registrationModel.updateAcademicIntake(reg.id, {
      sittings_count: sittings,
      result_types: cleaned,
    });
  }

  /**
   * M.10 — Companion to `getMeSubmissionPreview` that also returns the
   * underlying registration row so the controller can check `status`
   * before rendering the PDF.
   */
  async getMeRegistrationFormPayload(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) {
      throw httpError(404, 'No registration found for current user');
    }
    const preview = await this.getMeSubmissionPreview(userId);
    return { registration: reg, preview };
  }

  async getMeSubmissionPreview(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    // M.8d — pull result entries (parsed grades) alongside docs/biometrics
    const [profile, biometrics, documents, resultEntries] = await Promise.all([
      this.getMeProfile(userId),
      biometricCaptureModel.findByRegistrationId(reg.id),
      registrationDocumentModel.findByRegistration(reg.id),
      resultEntriesModel.findByRegistration(reg.id).catch(() => []),
    ]);
    const docsWithUrls = await Promise.all(
      documents.map(async (d) => {
        let download_url = null;
        if (d.file_id) {
          try {
            const file = await FileService.getFile(d.file_id, userId);
            download_url = file ? file.file_url : null;
          } catch {
            download_url = null;
          }
        }
        return {
          id: d.id,
          requirement_id: d.requirement_id,
          status: d.status,
          file_id: d.file_id,
          download_url,
          created_at: d.created_at,
        };
      })
    );
    const types = new Set(biometrics.map((b) => b.capture_type));
    const biometric_status =
      types.has('face') && types.has('fingerprint')
        ? 'complete'
        : types.size > 0
        ? 'partial'
        : 'none';
    // Group result entries by (source, sitting) for the figma `log in 18`
    // grouped subject/grade tables.
    const groupedAcademic = {};
    for (const entry of resultEntries) {
      const key = `${entry.source}-${entry.sitting}`;
      if (!groupedAcademic[key]) {
        groupedAcademic[key] = {
          source: entry.source,
          sitting: entry.sitting,
          origins: new Set(),
          rows: [],
        };
      }
      groupedAcademic[key].origins.add(entry.origin);
      groupedAcademic[key].rows.push({
        id: entry.id,
        serial: entry.serial,
        subject: entry.subject,
        grade: entry.grade,
        grade_normalized: entry.grade_normalized,
        score: entry.score,
        origin: entry.origin,
      });
    }
    const academic_details = Object.values(groupedAcademic).map((g) => ({
      source: g.source,
      sitting: g.sitting,
      origins: Array.from(g.origins),
      subjects: g.rows.sort((a, b) => a.serial - b.serial),
    }));

    return {
      candidate: profile.candidate,
      basic_information: profile.basic_information,
      contact_information: profile.contact_information,
      next_of_kin: profile.next_of_kin,
      subject_combination: profile.subject_combination,
      university: profile.university,
      session: profile.session,
      nin_verification: profile.nin_verification,
      documents: docsWithUrls,
      academic_details,
      biometrics: biometrics.map((b) => ({
        id: b.id,
        capture_type: b.capture_type,
        quality_score: b.quality_score,
        captured_at: b.captured_at,
      })),
      biometric_status,
    };
  }

  async getMeProfile(userId) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');
    const displays = await loadDisplayObjects(reg);
    const nin_verification = await loadNinVerificationSummary(reg);
    const userRow = await pool.query(
      `SELECT u.email, u.phone, p.title, p.first_name, p.last_name, p.display_name,
              p.date_of_birth, p.gender, p.profile_photo_url,
              p.residential_address, p.state_of_origin, p.lga, p.place_of_birth
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    const u = userRow.rows[0] || {};
    let ninPayload = {};
    let intake = {};
    if (reg.nin_verification_id) {
      const ninRow = await ninVerificationModel.findById(reg.nin_verification_id);
      if (ninRow) {
        ninPayload = ninRow.response_payload || {};
        intake = ninRow.intake_payload || {};
      }
    }
    const fullName =
      intake.name
      || u.display_name
      || [u.first_name, u.last_name].filter(Boolean).join(' ')
      || [ninPayload.first_name, ninPayload.last_name].filter(Boolean).join(' ')
      || null;
    // M.2: prefer student-edited profile values; fall back to NIN payload.
    let nokRow = null;
    try {
      const nokModel = require('../models/next-of-kin.model');
      nokRow = await nokModel.findActiveByRegistration(reg.id);
    } catch (e) {
      nokRow = null;
    }
    return {
      candidate: {
        id: reg.id,
        title: u.title || null,
        full_name: fullName,
        provisional_candidate_code: reg.provisional_candidate_code,
        jupeb_candidate_number: reg.jupeb_candidate_number,
        status: reg.status,
        photo_url: ninPayload.photo_url || u.profile_photo_url || null,
      },
      basic_information: {
        date_of_birth: ninPayload.date_of_birth || u.date_of_birth || null,
        gender: ninPayload.gender || u.gender || null,
        residential_address: u.residential_address || ninPayload.address || null,
        state_of_origin: u.state_of_origin || ninPayload.state_of_origin || null,
        lga: u.lga || ninPayload.lga || null,
        place_of_birth: u.place_of_birth || ninPayload.place_of_birth || null,
      },
      contact_information: {
        email: u.email || intake.email || null,
        phone: u.phone || intake.phone || ninPayload.phone || null,
      },
      next_of_kin: nokRow
        ? {
            name: nokRow.name,
            relationship: nokRow.relationship,
            phone: nokRow.phone,
            email: nokRow.email,
            address: nokRow.address,
            source: nokRow.source,
          }
        : ninPayload.next_of_kin || null,
      ...displays,
      nin_verification,
    };
  }

  /**
   * M.2 — Patch the editable subset of the candidate profile.
   * NIN-derived fields (name, date_of_birth, gender) are immutable when a
   * verified NIN payload is present.
   */
  async updateMeProfile(userId, body) {
    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');

    let ninPayload = {};
    if (reg.nin_verification_id) {
      const ninRow = await ninVerificationModel.findById(reg.nin_verification_id);
      if (ninRow && ninRow.status === 'verified') {
        ninPayload = ninRow.response_payload || {};
      }
    }

    await applyUserProfilePatch(userId, body, ninPayload);
    return this.getMeProfile(userId);
  }

  async _publicRegistrationSummary(reg) {
    const [nin_verification, displays] = await Promise.all([
      loadNinVerificationSummary(reg),
      loadDisplayObjects(reg),
    ]);
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
      sittings_count: reg.sittings_count,
      result_types: reg.result_types,
      nin_verification,
      ...displays,
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
        // Notify the candidate that their matric is ready — fire-and-
        // forget so SMTP RTT doesn't gate the rest of the loop. Email
        // also restates the lockdown rule so students aren't surprised
        // when their email/phone login stops working.
        setImmediate(() => { jupebMailer.sendMatricAssigned(r.id); });
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

  /**
   * Bulk-finalize every closed session that still has approved
   * registrations awaiting matric assignment. Each session is processed
   * via the same per-session `finalizeCandidateNumbers` method so
   * mailer + event-log + uniqueness behavior is identical.
   *
   * Returns `{ sessions: [{ session_id, academic_year, assigned, skipped, error? }], totals }`.
   * A failure on one session is captured but doesn't abort the others.
   */
  async finalizeAllClosedSessions(userId) {
    await assertFinalizeRole(userId);

    // Only walk sessions that actually have approved registrations
    // awaiting matric assignment. Without this filter the bulk path
    // is O(closed_sessions) regardless of work to do; with the filter
    // it's O(sessions_with_pending_rows) which is tiny in steady state.
    const elig = await pool.query(
      `SELECT s.*
         FROM jupeb_registration_sessions s
        WHERE s.status = 'closed'
          AND EXISTS (
            SELECT 1 FROM jupeb_registrations r
             WHERE r.session_id = s.id
               AND r.status = 'approved'
               AND r.jupeb_candidate_number IS NULL
          )
        ORDER BY s.opens_at DESC`
    );
    const closed = elig.rows;
    const results = [];
    let totalAssigned = 0;
    let totalSkipped = 0;
    let totalSessionsTouched = 0;

    for (const s of closed) {
      try {
        const out = await this.finalizeCandidateNumbers(s.id, userId);
        if (out.assigned > 0) totalSessionsTouched += 1;
        totalAssigned += out.assigned;
        totalSkipped += out.skipped;
        results.push({
          session_id: s.id,
          academic_year: s.academic_year,
          year_short: s.year_short,
          assigned: out.assigned,
          skipped: out.skipped,
        });
      } catch (err) {
        // Per-session failures shouldn't abort the whole bulk run.
        results.push({
          session_id: s.id,
          academic_year: s.academic_year,
          year_short: s.year_short,
          assigned: 0,
          skipped: 0,
          error: err.message || 'finalize_failed',
        });
      }
    }

    return {
      sessions: results,
      totals: {
        sessions_processed: results.length,
        sessions_touched: totalSessionsTouched,
        assigned: totalAssigned,
        skipped: totalSkipped,
      },
    };
  }
}

module.exports = new RegistrationService();
