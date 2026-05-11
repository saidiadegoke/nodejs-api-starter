const crypto = require('crypto');
const pool = require('../../../db/pool');
const registrationModel = require('../models/registration.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const universityModel = require('../models/university.model');
const sessionModel = require('../models/session.model');
const ninVerificationModel = require('../models/nin-verification.model');
const biometricCaptureModel = require('../models/biometric-capture.model');
const registrationDocumentModel = require('../models/registration-document.model');
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

/**
 * Shape an enriched institution-list row for the dashboard. Joins are done
 * in the model query; here we just project to a compact response shape.
 */
function enrichListRow(row) {
  if (!row) return row;
  const fullName =
    row.display_name ||
    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
    null;
  const biometric_status =
    row.has_face && row.has_fingerprint
      ? 'yes'
      : row.has_face || row.has_fingerprint
      ? 'partial'
      : 'no';
  const candidate = {
    id: row.user_id || null,
    name: fullName,
    email: row.user_email || null,
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

async function loadDisplayObjects(reg) {
  if (!reg) return {};
  const [combo, university, session] = await Promise.all([
    reg.subject_combination_id ? subjectCombinationModel.findById(reg.subject_combination_id) : null,
    reg.university_id ? universityModel.findById(reg.university_id) : null,
    reg.session_id ? sessionModel.findById(reg.session_id) : null,
  ]);
  return {
    subject_combination: combo ? { id: combo.id, code: combo.code, title: combo.title } : null,
    university: university ? { id: university.id, name: university.name, jupeb_prefix: university.jupeb_prefix } : null,
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

  // Terminal status → purge the cached NIN profile (PII no longer needed)
  // and invalidate the cache so any subsequent verifyNin call for the same
  // NIN goes to the provider fresh. Best-effort: a clear failure must not
  // block the status transition itself.
  if (TERMINAL_STATUSES.has(toStatus) && reg.nin_verification_id) {
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

      // Send the candidate the registration code via email if we know
      // their intake email. Fire-and-forget — no-ops silently when SMTP
      // isn't configured or no email is on the verification's intake.
      // Deferred via setImmediate so the unawaited promise's DB queries
      // don't share the express response's microtask tail (which
      // measurably delays response in async-hooks-instrumented stacks).
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
   *   - next-of-kin
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
    const documentModel = require('../models/registration-document.model');
    const resultEntriesModel = require('../models/result-entries.model');

    const [
      displays,
      nin_verification,
      candidate,
      biometrics,
      next_of_kin,
      documents,
      result_entries,
      history,
    ] = await Promise.all([
      loadDisplayObjects(reg),
      loadNinVerificationSummary(reg),
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
      Promise.resolve()
        .then(() => documentModel.findByRegistrationIdWithRequirements
          ? documentModel.findByRegistrationIdWithRequirements(reg.id)
          : documentModel.findByRegistrationId
            ? documentModel.findByRegistrationId(reg.id)
            : [])
        .catch(() => []),
      Promise.resolve()
        .then(() => resultEntriesModel.listByRegistrationId
          ? resultEntriesModel.listByRegistrationId(reg.id)
          : resultEntriesModel.findByRegistrationId
            ? resultEntriesModel.findByRegistrationId(reg.id)
            : [])
        .catch(() => []),
      pool.query(
        `SELECT from_status, to_status, reason, changed_by, created_at
           FROM jupeb_registration_status_history
          WHERE registration_id = $1
          ORDER BY created_at ASC`,
        [reg.id]
      ).then((r) => r.rows).catch(() => []),
    ]);

    // Decode biometric status (mirrors the list endpoint's enrichment).
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
      status: reg.status,
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
      candidate: candidate ? {
        id: candidate.id,
        email: candidate.email,
        phone: candidate.phone,
        email_verified: candidate.email_verified,
        phone_verified: candidate.phone_verified,
        last_login_at: candidate.last_login_at,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        display_name: candidate.display_name
          || [candidate.first_name, candidate.last_name].filter(Boolean).join(' ').trim()
          || null,
        date_of_birth: candidate.date_of_birth,
        gender: candidate.gender,
        profile_photo_url: candidate.profile_photo_url,
        residential_address: candidate.residential_address,
        state_of_origin: candidate.state_of_origin,
        lga: candidate.lga,
        place_of_birth: candidate.place_of_birth,
      } : null,
      next_of_kin: next_of_kin ? {
        name: next_of_kin.name,
        relationship: next_of_kin.relationship,
        phone: next_of_kin.phone,
        email: next_of_kin.email,
        address: next_of_kin.address,
        source: next_of_kin.source,
      } : null,
      documents: documents || [],
      result_entries: result_entries || [],
      biometrics: (biometrics || []).map((b) => ({
        id: b.id,
        capture_type: b.capture_type,
        quality_score: b.quality_score,
        captured_at: b.captured_at,
        external_reference: b.external_reference || null,
      })),
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

  async institutionList(query, userId) {
    await assertInstitutionRegistration(userId);
    const safePage = Math.max(1, parseInt(query.page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const { university_id, session_id, status, bucket, q } = query;
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    if (bucket && !['approved', 'pending', 'rejected'].includes(bucket)) {
      throw httpError(422, 'bucket must be one of approved, pending, rejected');
    }
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    const filters = {
      university_id: scopedUniversityId,
      session_id: session_id || null,
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
    return {
      rows: rows.map(enrichListRow),
      page: safePage,
      limit: safeLimit,
      total,
    };
  }

  /**
   * E.4 — KPI counts for the figma "Total Registered / Pending / Approved /
   * Rejected / With biometrics" cards. Scoped to the caller's institution.
   */
  async institutionStats(query, userId) {
    await assertInstitutionRegistration(userId);
    const { university_id, session_id } = query || {};
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    return registrationModel.statsInstitution({
      university_id: scopedUniversityId,
      session_id: session_id || null,
    });
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
    return registrationModel.byUniversity({
      session_id: session_id || null,
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
    const { university_id, session_id, status, bucket, q } = query || {};
    if (university_id && !isUuid(university_id)) throw httpError(422, 'university_id must be a valid UUID');
    if (session_id && !isUuid(session_id)) throw httpError(422, 'session_id must be a valid UUID');
    if (bucket && !['approved', 'pending', 'rejected'].includes(bucket)) {
      throw httpError(422, 'bucket must be one of approved, pending, rejected');
    }
    const scopedUniversityId = await effectiveInstitutionListUniversityId(userId, university_id || null);
    const filters = {
      university_id: scopedUniversityId,
      session_id: session_id || null,
      status: status || null,
      bucket: bucket || null,
      q: q || null,
    };
    const rows = await registrationModel.listInstitution({
      ...filters,
      limit: 10000,
      offset: 0,
    });

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
    for (const row of rows) {
      const enriched = enrichListRow(row);
      const candidate = enriched.candidate || {};
      lines.push([
        candidate.candidate_id,
        candidate.name,
        candidate.email,
        enriched.university && enriched.university.name,
        '', // subject_combination title not joined here; could enhance via display_name
        row.sittings_count,
        row.status,
        enriched.biometric_status,
        row.institution_issued_code,
        row.jupeb_candidate_number,
        row.provisional_candidate_code,
        row.created_at && row.created_at.toISOString && row.created_at.toISOString(),
        row.submitted_at && row.submitted_at.toISOString && row.submitted_at.toISOString(),
        row.approved_at && row.approved_at.toISOString && row.approved_at.toISOString(),
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
    return transitionStatus(reg, 'rejected', {
      userId,
      reason,
      extraFields: { status_reason: reason },
    });
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
    return transitionStatus(reg, 'withdrawn', {
      userId,
      reason: reason || null,
      extraFields: { status_reason: reason || null },
    });
  }

  /**
   * E.7 — batch approve / reject / withdraw. Loops over rows and applies the
   * per-row guards from the existing single-row endpoints. Never short-circuits
   * on first failure: every id gets a verdict, returned as
   *   { accepted: [{ id, status }], rejected: [{ id, error_code, message }] }.
   *
   * Body: { ids: [uuid, ...], action: 'approve'|'reject'|'withdraw', reason?: string }
   *   - approve: no reason required.
   *   - reject:  reason required.
   *   - withdraw: reason optional.
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
    if (!['approve', 'reject', 'withdraw'].includes(action)) {
      throw httpError(422, 'action must be one of approve, reject, withdraw');
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
        let updated;
        if (action === 'approve') {
          updated = await this.institutionApprove(id, userId);
        } else if (action === 'reject') {
          updated = await this.institutionReject(id, { reason }, userId);
        } else {
          updated = await this.institutionWithdraw(id, { reason }, userId);
        }
        accepted.push({ id, status: updated && updated.status });
      } catch (err) {
        rejected.push({
          id,
          error_code: (err.details && err.details.error_code) || mapErrorCode(err),
          message: err.message,
          status: err.status || 500,
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
    // eslint-disable-next-line global-require
    const resultEntriesModel = require('../models/result-entries.model');
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
      `SELECT u.email, u.phone, p.first_name, p.last_name, p.display_name,
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
    if (!body || typeof body !== 'object') throw httpError(422, 'Body is required');

    const reg = await registrationModel.findLatestForUser(userId);
    if (!reg || reg.user_id !== userId) throw httpError(404, 'No registration found for current user');

    let ninPayload = {};
    if (reg.nin_verification_id) {
      const ninRow = await ninVerificationModel.findById(reg.nin_verification_id);
      if (ninRow && ninRow.status === 'verified') {
        ninPayload = ninRow.response_payload || {};
      }
    }

    const errors = [];

    // Reject NIN-immutable fields when present in the body.
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

      // Upsert profile row (legacy users may not have one yet)
      const profileFields = Object.entries(editable).filter(([, v]) => v !== undefined);
      if (profileFields.length) {
        // Make sure a profile row exists
        await client.query(
          `INSERT INTO profiles (user_id) VALUES ($1)
           ON CONFLICT (user_id) DO NOTHING`,
          [userId]
        );
        const setSql = profileFields
          .map(([k], idx) => `${k} = $${idx + 2}`)
          .join(', ');
        const values = profileFields.map(([, v]) => (v === '' ? null : v));
        await client.query(
          `UPDATE profiles
              SET ${setSql}, updated_at = NOW()
            WHERE user_id = $1`,
          [userId, ...values]
        );
      }

      if (phone !== undefined) {
        await client.query(
          `UPDATE users SET phone = $2, updated_at = NOW() WHERE id = $1`,
          [userId, phone === '' ? null : phone]
        );
      }
      if (email !== undefined && email) {
        const dup = await client.query(
          `SELECT id FROM users WHERE email = $1 AND id <> $2 LIMIT 1`,
          [email, userId]
        );
        if (dup.rows.length) {
          throw httpError(409, 'Email already in use');
        }
        await client.query(
          `UPDATE users SET email = $2, updated_at = NOW() WHERE id = $1`,
          [userId, email]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }

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

    const closed = await sessionModel.findAll({ limit: 1000, offset: 0, status: 'closed' });
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
