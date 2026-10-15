const pool = require('../../../database/pool');
const ninVerificationModel = require('../models/nin-verification.model');
const subjectCombinationModel = require('../models/subject-combination.model');
const biometricCaptureModel = require('../models/biometric-capture.model');
const registrationModel = require('../models/registration.model');
const ninAdapter = require('./nin-adapter.service');
const { emitNinResolved } = require('./nin-events.service');
const FileService = require('../../files/services/file.service');
const FileModel = require('../../files/models/file.model');
const { normalizeNin, hashNin, ninLast4, validateBiometricPayload } = require('../utils/identity-crypto');
const { getUserRoles } = require('../../../utils/middleware/rbac.middleware');
const { assertInstitutionUniversityAccess } = require('../utils/institution-scope');

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

/** 8-4-4-4-12 hex (PostgreSQL accepts this even when RFC version/variant nibbles are non-standard). */
function isUuidHexShape(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value).trim())
  );
}

/** jsonb is usually an object; normalize string JSON so intake fields are visible to resolvers. */
function normalizeIntakePayload(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

const PRIVILEGED = new Set([
  'super_admin',
  'admin',
  'registrar',
  'program_director',
  'institution_admin',
]);

const SKIPPABLE_TYPES = new Set(['face', 'fingerprint']);

function skipColumnFor(type) {
  return type === 'face' ? 'face_skipped_at' : 'fingerprint_skipped_at';
}

async function userHasPrivilegedIdentityRole(userId) {
  const roles = await getUserRoles(userId);
  return roles.some((r) => PRIVILEGED.has(r));
}

/**
 * Face selfies uploaded via /files must become the durable candidate photo
 * (NIN provider photo_url expires). Writes the stored files.file_url onto
 * the registration owner's profiles.profile_photo_url (overwrite).
 */
async function applyFaceSelfieToProfile(registration, fileIdOrUrl) {
  if (!registration || !registration.user_id || !fileIdOrUrl) return;
  let url = null;
  if (isUuid(fileIdOrUrl)) {
    const file = await FileModel.findById(fileIdOrUrl);
    if (!file) return;
    url = file.file_url != null ? String(file.file_url).trim() : '';
  } else if (typeof fileIdOrUrl === 'string' && (fileIdOrUrl.startsWith('http://') || fileIdOrUrl.startsWith('https://'))) {
    url = fileIdOrUrl.trim();
  }
  if (!url) return;
  await pool.query(
    `INSERT INTO profiles (user_id, profile_photo_url) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET profile_photo_url = EXCLUDED.profile_photo_url, updated_at = NOW()`,
    [registration.user_id, url]
  );
}

function sanitizeVerification(row) {
  if (!row) return null;
  return {
    id: row.id,
    nin_last4: row.nin_last4,
    provider: row.provider,
    provider_reference: row.provider_reference,
    status: row.status,
    response_payload: row.response_payload,
    error_payload: row.error_payload,
    verified_at: row.verified_at,
    requested_by: row.requested_by,
    created_at: row.created_at,
    intake_payload: row.intake_payload || {},
    attempt_count: row.attempt_count ?? 0,
    retry_after: row.retry_after || null,
    last_error_code: row.last_error_code || null,
  };
}

/**
 * Optional DB context for verify responses: the authenticated user (registrar)
 * and any registration already linked to this verification id.
 */
async function enrichVerifyContext(row, userId) {
  const extra = {};
  if (!userId || !isUuid(userId)) return extra;
  try {
    const [callerRes, regRes] = await Promise.all([
      pool.query(
        `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified, u.last_login_at,
                p.title AS profile_title, p.first_name, p.last_name, p.display_name,
                p.date_of_birth, p.gender, p.profile_photo_url, p.residential_address,
                p.state_of_origin, p.lga, p.place_of_birth
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1
          LIMIT 1`,
        [userId]
      ),
      pool.query(
        `SELECT r.id, r.status, r.session_id, r.university_id, r.subject_combination_id,
                r.user_id, r.nin_verification_id, r.institution_issued_code,
                r.provisional_candidate_code, r.jupeb_candidate_number,
                r.claimed_at, r.submitted_at, r.approved_at, r.created_at, r.updated_at
           FROM jupeb_registrations r
          WHERE r.nin_verification_id = $1
          ORDER BY r.updated_at DESC NULLS LAST, r.created_at DESC
          LIMIT 1`,
        [row.id]
      ),
    ]);
    const c = callerRes.rows[0];
    if (c) {
      extra.caller_user = {
        id: c.id,
        email: c.email,
        phone: c.phone,
        email_verified: c.email_verified,
        phone_verified: c.phone_verified,
        last_login_at: c.last_login_at,
        profile: {
          title: c.profile_title,
          first_name: c.first_name,
          last_name: c.last_name,
          display_name: c.display_name,
          date_of_birth: c.date_of_birth,
          gender: c.gender,
          profile_photo_url: c.profile_photo_url,
          residential_address: c.residential_address,
          state_of_origin: c.state_of_origin,
          lga: c.lga,
          place_of_birth: c.place_of_birth,
        },
      };
    }
    if (regRes.rows[0]) {
      extra.registration = regRes.rows[0];
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[enrichVerifyContext]', err && err.message);
  }
  return extra;
}

/**
 * Full `subject_combination` + `subject_items` for verify responses (read-only).
 * Uses hex-shaped id matching; only **active** catalog rows resolve.
 */
async function subjectCombinationByCatalogId(rawId) {
  if (rawId == null || rawId === '') return null;
  const cid = String(rawId).trim();
  if (!isUuidHexShape(cid)) return null;
  const combo = await subjectCombinationModel.findById(cid);
  if (!combo || combo.status !== 'active') return null;
  const subject_items = await subjectCombinationModel.listItems(combo.id);
  return { ...combo, subject_items: subject_items || [] };
}

async function subjectCombinationFromIntake(intake) {
  if (!intake || typeof intake !== 'object') return null;
  return subjectCombinationByCatalogId(intake.subject_combination_id);
}

/**
 * Prefer intake `subject_combination_id`; if it does not resolve, use a linked
 * registration's `subject_combination_id` (institution row created before verify).
 */
async function resolveSubjectCombinationForVerify(row, extra) {
  const intake = normalizeIntakePayload(row.intake_payload);
  let resolved = await subjectCombinationFromIntake(intake);
  if (resolved) return resolved;
  const regSid = extra && extra.registration && extra.registration.subject_combination_id;
  if (regSid) resolved = await subjectCombinationByCatalogId(regSid);
  return resolved || null;
}

async function publicVerifyResponse(row, userId) {
  const rawPayload = row.response_payload && typeof row.response_payload === 'object'
    ? row.response_payload
    : {};
  const intakePayloadObj = normalizeIntakePayload(row.intake_payload);
  const profile = {
    ...rawPayload,
    nin_last4: row.nin_last4,
  };
  const out = {
    verification_id: row.id,
    status: row.status,
    profile,
    intake_payload: intakePayloadObj,
  };
  if (row.status === 'pending') {
    out.retry_after = row.retry_after;
    out.last_error_code = row.last_error_code;
    // Surface the upstream message verbatim — operators need to see e.g.
    // "Your Identity balance is empty. Top up at /dashboard/identity/plans."
    // instead of the generic "provider unavailable" we used to send.
    if (row.error_payload && (row.error_payload.message || row.error_payload.error_message)) {
      out.error_message = row.error_payload.message || row.error_payload.error_message;
    }
  }
  if (row.status === 'failed' && row.error_payload && Object.keys(row.error_payload).length) {
    out.error = row.error_payload;
  }
  const extra = await enrichVerifyContext(row, userId);
  const subjectCombination = await resolveSubjectCombinationForVerify(row, extra);
  if (subjectCombination) out.subject_combination = subjectCombination;
  Object.assign(out, extra);
  return out;
}

async function publicVerifyFailedResponse(row, userId) {
  const intakePayloadObj = normalizeIntakePayload(row.intake_payload);
  const profile = { nin_last4: row.nin_last4 };
  const out = {
    verification_id: row.id,
    status: 'failed',
    profile,
    intake_payload: intakePayloadObj,
    error: row.error_payload,
  };
  const extra = await enrichVerifyContext(row, userId);
  const subjectCombination = await resolveSubjectCombinationForVerify(row, extra);
  if (subjectCombination) out.subject_combination = subjectCombination;
  Object.assign(out, extra);
  return out;
}

const INTAKE_KEYS = ['name', 'email', 'phone', 'subject_combination_id'];
function pickIntake(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const k of INTAKE_KEYS) {
    if (input[k] !== undefined && input[k] !== null) out[k] = input[k];
  }
  return out;
}

class IdentityService {
  async verifyNin({ nin, idempotency_key, intake_payload, session_id, provider: providerOverride, force_fresh }, userId) {
    const normalized = normalizeNin(nin);
    if (normalized.length !== 11) {
      throw httpError(422, 'NIN must be exactly 11 digits');
    }
    const ninHash = hashNin(normalized);
    const last4 = ninLast4(normalized);
    const idemKey = idempotency_key ? String(idempotency_key).trim() : null;
    const intake = pickIntake(intake_payload);
    const adapterOpts = {};
    if (providerOverride) adapterOpts.provider = String(providerOverride);
    if (force_fresh) adapterOpts.force_fresh = true;

    // Early duplicate check: if NIN already has an active registration, reject early on the form page
    const targetSessionId = session_id || (intake_payload && intake_payload.session_id) || null;
    if (targetSessionId) {
      const blockedInSession = await registrationModel.hasBlockingRegistrationForNinHash(ninHash, {
        sessionId: targetSessionId,
      });
      if (blockedInSession) {
        const err = httpError(
          409,
          'This NIN is already registered for this academic session. Duplicate NINs cannot be registered.'
        );
        err.details = { error_code: 'duplicate_nin_session', session_id: targetSessionId, nin_last4: last4 };
        throw err;
      }
    }

    const blockedGlobally = await registrationModel.hasBlockingRegistrationForNinHash(ninHash);
    if (blockedGlobally) {
      const err = httpError(
        409,
        'This NIN is already registered with an active candidate in the system. Duplicate NINs cannot be registered.'
      );
      err.details = { error_code: 'duplicate_nin', nin_last4: last4 };
      throw err;
    }

    // Idempotency: replay the in-flight or resolved row for a reused key —
    // except terminal failures, which must never be replayed. A failed row
    // falls through for a fresh upstream attempt and is updated in place
    // below (preserves the unique idempotency key and the attempt history).
    let idempotentFailedRow = null;
    if (idemKey) {
      const existing = await ninVerificationModel.findByIdempotencyKey(idemKey);
      if (existing) {
        if (existing.nin_hash !== ninHash) {
          throw httpError(409, 'idempotency_key was already used for a different NIN');
        }
        if (existing.status === 'failed') {
          idempotentFailedRow = existing;
        } else {
          let rowOut = existing;
          if (Object.keys(intake).length) {
            const updated = await ninVerificationModel.mergeIntakePayload(existing.id, intake);
            if (updated) rowOut = updated;
          }
          return publicVerifyResponse(rowOut, userId);
        }
      }
    }

    // Cache: while an earlier verified row exists for this NIN and its
    // linked registration hasn't reached a terminal status (i.e.
    // cleared_at is still null), reuse it instead of paying another
    // provider call. The cache is cleared when the registration reaches
    // approved/rejected/withdrawn (see RegistrationService transitionStatus).
    const cached = await ninVerificationModel.findActiveCacheByNinHash(ninHash);
    if (cached) {
      let rowOut = cached;
      if (Object.keys(intake).length) {
        const updated = await ninVerificationModel.mergeIntakePayload(cached.id, intake);
        if (updated) rowOut = updated;
      }
      return publicVerifyResponse(rowOut, userId);
    }

    const adapterResult = await ninAdapter.verifyNin(normalized, adapterOpts);
    const useBodyMock = String(providerOverride || '').toLowerCase() === 'mock';
    const provider =
      useBodyMock || adapterResult.simulated_outage ? 'mock' : 'speedysms';

    if (adapterResult.outcome === 'unavailable') {
      const seconds = adapterResult.retry_after_seconds || 300;
      const retry_after = new Date(Date.now() + seconds * 1000).toISOString();
      let row = null;
      if (idempotentFailedRow) {
        if (Object.keys(intake).length) {
          await ninVerificationModel.mergeIntakePayload(idempotentFailedRow.id, intake);
        }
        row = await ninVerificationModel.markPending(idempotentFailedRow.id, {
          retry_after,
          last_error_code: adapterResult.error_code || 'provider_unavailable',
          error_payload: {
            code: adapterResult.error_code || 'provider_unavailable',
            message: adapterResult.error_message || null,
          },
        });
      }
      row =
        row ||
        (await ninVerificationModel.createPending({
          nin_hash: ninHash,
          nin_last4: last4,
          provider,
          idempotency_key: idemKey,
          intake_payload: intake,
          retry_after,
          last_error_code: adapterResult.error_code || 'provider_unavailable',
          error_payload: {
            code: adapterResult.error_code || 'provider_unavailable',
            message: adapterResult.error_message || null,
          },
          requested_by: userId,
        }));
      return publicVerifyResponse(row, userId);
    }

    if (adapterResult.outcome === 'failed') {
      let row = null;
      if (idempotentFailedRow) {
        if (Object.keys(intake).length) {
          await ninVerificationModel.mergeIntakePayload(idempotentFailedRow.id, intake);
        }
        row = await ninVerificationModel.markFailed(idempotentFailedRow.id, {
          error_payload: {
            code: adapterResult.error_code || 'verification_failed',
            message: adapterResult.error_message || 'Verification failed',
          },
          last_error_code: adapterResult.error_code || 'verification_failed',
        });
      }
      row =
        row ||
        (await ninVerificationModel.create({
          nin_hash: ninHash,
          nin_last4: last4,
          provider,
          provider_reference: adapterResult.provider_reference || null,
          idempotency_key: idemKey,
          status: 'failed',
          response_payload: {},
          error_payload: {
            code: adapterResult.error_code || 'verification_failed',
            message: adapterResult.error_message || 'Verification failed',
          },
          verified_at: null,
          requested_by: userId,
          intake_payload: intake,
        }));
      return publicVerifyFailedResponse(row, userId);
    }

    let verifiedRow = null;
    if (idempotentFailedRow) {
      if (Object.keys(intake).length) {
        await ninVerificationModel.mergeIntakePayload(idempotentFailedRow.id, intake);
      }
      verifiedRow = await ninVerificationModel.markVerified(idempotentFailedRow.id, {
        response_payload: { ...adapterResult.profile },
        provider_reference: adapterResult.provider_reference || null,
      });
    }
    const row =
      verifiedRow ||
      (await ninVerificationModel.create({
        nin_hash: ninHash,
        nin_last4: last4,
        provider,
        provider_reference: adapterResult.provider_reference || null,
        idempotency_key: idemKey,
        status: 'verified',
        response_payload: { ...adapterResult.profile },
        error_payload: {},
        verified_at: new Date().toISOString(),
        requested_by: userId,
        intake_payload: intake,
      }));
    return publicVerifyResponse(row, userId);
  }

  async retryVerification(verificationId, userId) {
    if (!isUuid(verificationId)) throw httpError(422, 'Invalid verification id');
    const existing = await ninVerificationModel.findById(verificationId);
    if (!existing) throw httpError(404, 'Verification not found');
    if (existing.status !== 'pending') {
      return publicVerifyResponse(existing, userId);
    }
    const adapterResult = await ninAdapter.verifyNin(
      existing.nin_last4.padStart(11, '0'),
      ninAdapter.verifyOptsFromStoredProvider(existing.provider)
    );
    if (adapterResult.outcome === 'verified') {
      const row = await ninVerificationModel.markVerified(verificationId, {
        response_payload: adapterResult.profile || {},
        provider_reference: adapterResult.provider_reference || existing.provider_reference,
      });
      await emitNinResolved(verificationId, 'verified');

      // M.12 — best-effort write-through to any registration linked to this verification.
      try {
        const linked = await pool.query(
          `SELECT id FROM jupeb_registrations WHERE nin_verification_id = $1`,
          [verificationId]
        );
        if (linked.rows.length) {
          // eslint-disable-next-line global-require
          const { applyNinPayloadToRegistration } = require('./nin-write-through.service');
          for (const reg of linked.rows) {
            await applyNinPayloadToRegistration({
              registrationId: reg.id,
              ninPayload: row.response_payload || {},
              userId,
            }).catch((e) => {
              // eslint-disable-next-line no-console
              console.warn('[markVerified] write-through failed for registration', reg.id, e && e.message);
            });
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[markVerified] write-through query failed:', err && err.message);
      }

      return publicVerifyResponse(row, userId);
    }
    if (adapterResult.outcome === 'failed') {
      const row = await ninVerificationModel.markFailed(verificationId, {
        error_payload: {
          code: adapterResult.error_code || 'verification_failed',
          message: adapterResult.error_message || 'Verification failed',
        },
        last_error_code: adapterResult.error_code || 'verification_failed',
      });
      await emitNinResolved(verificationId, 'failed');
      return publicVerifyFailedResponse(row, userId);
    }
    const seconds = adapterResult.retry_after_seconds || 300;
    const retry_after = new Date(Date.now() + seconds * 1000).toISOString();
    const row = await ninVerificationModel.incrementAttempt(verificationId, {
      retry_after,
      last_error_code: adapterResult.error_code || 'provider_unavailable',
      error_payload: {
        code: adapterResult.error_code || 'provider_unavailable',
        message: adapterResult.error_message || null,
      },
    });
    return publicVerifyResponse(row || existing, userId);
  }

  async getVerification(verificationId, userId) {
    if (!isUuid(verificationId)) throw httpError(422, 'Invalid verification id');
    const row = await ninVerificationModel.findById(verificationId);
    if (!row) throw httpError(404, 'Verification not found');
    const privileged = await userHasPrivilegedIdentityRole(userId);
    if (!privileged && row.requested_by !== userId) {
      throw httpError(403, 'Access denied');
    }
    return sanitizeVerification(row);
  }

  /**
   * Shallow-merge allowed intake fields on a verification without re-calling the NIN provider.
   * Body: flat `{ name?, email?, phone?, subject_combination_id? }` (preferred), or legacy
   * `{ intake_payload: { ... } }`. Root-level keys override the same keys inside `intake_payload`.
   */
  async patchNinIntake(verificationId, body, userId) {
    if (!isUuid(verificationId)) throw httpError(422, 'Invalid verification id');
    const row = await ninVerificationModel.findById(verificationId);
    if (!row) throw httpError(404, 'Verification not found');

    const regRes = await pool.query(
      `SELECT id, university_id, status FROM jupeb_registrations
       WHERE nin_verification_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [verificationId]
    );
    const reg = regRes.rows[0] || null;
    const TERMINAL_STATUSES = new Set(['approved', 'rejected', 'withdrawn']);
    if (reg && TERMINAL_STATUSES.has(reg.status)) {
      throw httpError(422, 'NIN intake cannot be updated for a registration in a terminal state');
    }

    if (reg) {
      await assertInstitutionUniversityAccess(userId, reg.university_id);
    } else {
      const privileged = await userHasPrivilegedIdentityRole(userId);
      if (!privileged) throw httpError(403, 'Access denied');
    }

    const fromNested =
      body && body.intake_payload && typeof body.intake_payload === 'object'
        ? pickIntake(body.intake_payload)
        : {};
    const fromRoot = body && typeof body === 'object' ? pickIntake(body) : {};
    const intake = { ...fromNested, ...fromRoot };
    if (!Object.keys(intake).length) {
      throw httpError(
        422,
        'Provide at least one of: name, email, phone, subject_combination_id (on the request body or inside intake_payload)'
      );
    }

    if (intake.subject_combination_id !== undefined && intake.subject_combination_id !== null) {
      const scid = String(intake.subject_combination_id).trim();
      if (!isUuid(scid)) throw httpError(422, 'subject_combination_id must be a valid UUID');
      if (!reg) {
        throw httpError(
          422,
          'subject_combination_id can only be set when a registration exists for this verification'
        );
      }
      const combo = await subjectCombinationModel.findById(scid);
      if (!combo || combo.status !== 'active') {
        throw httpError(404, 'Subject combination not found or inactive');
      }
      if (!combo.is_global && String(combo.university_id || '') !== String(reg.university_id)) {
        throw httpError(422, 'Subject combination is not available for this university');
      }
    }

    const updated = await ninVerificationModel.mergeIntakePayload(verificationId, intake);
    const fresh = updated || (await ninVerificationModel.findById(verificationId));
    return sanitizeVerification(fresh);
  }

  async assertRegistrationAccess(userId, registration) {
    if (!registration) throw httpError(404, 'Registration not found');
    const privileged = await userHasPrivilegedIdentityRole(userId);
    if (privileged) return;
    if (registration.user_id && registration.user_id === userId) return;
    throw httpError(403, 'Access denied');
  }

  async createBiometric(body, userId) {
    const v = validateBiometricPayload(body);
    if (!v.ok) throw httpError(422, v.error);
    if (!isUuid(body.registration_id)) throw httpError(422, 'registration_id must be a valid UUID');
    const registration = await registrationModel.findById(body.registration_id);
    await this.assertRegistrationAccess(userId, registration);
    const skipColumn = skipColumnFor(body.capture_type);
    if (registration[skipColumn] && !(await userHasPrivilegedIdentityRole(userId))) {
      throw httpError(403, `Self-service capture is locked: ${body.capture_type} was previously skipped`);
    }
    if (body.capture_type === 'face') {
      const minQuality = Number(process.env.JUPEB_FACE_MIN_QUALITY);
      const score = Number(body.quality_score);
      if (Number.isFinite(minQuality) && minQuality > 0 && Number.isFinite(score) && score < minQuality) {
        const err = httpError(
          422,
          `Face capture quality_score ${score} is below threshold ${minQuality}`
        );
        err.details = {
          error_code: 'quality_too_low',
          quality_score: score,
          minimum: minQuality,
        };
        throw err;
      }
    }
    const capturedAt = body.captured_at ? new Date(body.captured_at) : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      throw httpError(422, 'captured_at must be a valid ISO date');
    }
    // Resolve file_id or file_url for face captures
    let resolvedFileId = v.file_id;
    let resolvedFileUrl = null;
    if (body.capture_type === 'face') {
      const candidateId = v.file_id || (v.external_reference && isUuid(v.external_reference) ? v.external_reference : null);
      if (candidateId) {
        const file = await FileModel.findById(candidateId);
        if (file) {
          resolvedFileId = file.id;
          resolvedFileUrl = file.file_url ? String(file.file_url).trim() : null;
        } else if (v.file_id) {
          throw httpError(404, 'File not found');
        }
      } else if (v.external_reference && (v.external_reference.startsWith('http://') || v.external_reference.startsWith('https://'))) {
        resolvedFileUrl = v.external_reference.trim();
      }
    }

    // If an active capture of this type already exists, replace it rather than failing with 409
    const existingCaptures = await biometricCaptureModel.findByRegistrationId(body.registration_id);
    const existingActive = existingCaptures.filter(
      (c) => c.capture_type === body.capture_type && !c.replaced_at
    );
    for (const ex of existingActive) {
      await biometricCaptureModel.markReplaced(ex.id);
    }

    let row;
    try {
      row = await biometricCaptureModel.create({
        registration_id: body.registration_id,
        capture_type: body.capture_type,
        file_id: resolvedFileId || null,
        external_reference: resolvedFileId ? null : v.external_reference,
        quality_score: body.quality_score,
        device_metadata: body.device_metadata,
        captured_at: capturedAt.toISOString(),
      });
    } catch (e) {
      if (e.code === '23505') {
        const captures = await biometricCaptureModel.findByRegistrationId(body.registration_id);
        for (const ex of captures.filter((c) => c.capture_type === body.capture_type && !c.replaced_at)) {
          await biometricCaptureModel.markReplaced(ex.id);
        }
        row = await biometricCaptureModel.create({
          registration_id: body.registration_id,
          capture_type: body.capture_type,
          file_id: resolvedFileId || null,
          external_reference: resolvedFileId ? null : v.external_reference,
          quality_score: body.quality_score,
          device_metadata: body.device_metadata,
          captured_at: capturedAt.toISOString(),
        });
      } else {
        throw e;
      }
    }
    if (body.capture_type === 'face') {
      await applyFaceSelfieToProfile(registration, resolvedFileId || resolvedFileUrl || v.external_reference);
    }
    return row;
  }

  async skipBiometric(registrationId, body, userId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    if (!body || !SKIPPABLE_TYPES.has(body.capture_type)) {
      throw httpError(422, 'capture_type must be face or fingerprint');
    }
    const registration = await registrationModel.findById(registrationId);
    await this.assertRegistrationAccess(userId, registration);
    return registrationModel.setBiometricSkip(registrationId, body.capture_type);
  }

  async listBiometrics(registrationId, userId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const registration = await registrationModel.findById(registrationId);
    await this.assertRegistrationAccess(userId, registration);
    return biometricCaptureModel.findByRegistrationId(registrationId);
  }

  async getRegistrationPhoto(registrationId, userId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const registration = await registrationModel.findById(registrationId);
    await this.assertRegistrationAccess(userId, registration);
    const captures = await biometricCaptureModel.findByRegistrationId(registrationId);
    const face = [...captures].reverse().find((c) => c.capture_type === 'face' && !c.replaced_at && (c.file_id || c.external_reference));
    if (!face) throw httpError(404, 'No face capture found for this registration');
    if (face.file_id) {
      const file = await FileService.getFile(face.file_id, userId);
      if (file) {
        return {
          url: file.file_url,
          file_id: file.id,
          file_type: file.file_type,
          captured_at: face.captured_at,
        };
      }
    }
    if (face.external_reference && isUuid(face.external_reference)) {
      const file = await FileModel.findById(face.external_reference);
      if (file) {
        return {
          url: file.file_url,
          file_id: file.id,
          file_type: file.file_type,
          captured_at: face.captured_at,
        };
      }
    }
    if (face.external_reference && (face.external_reference.startsWith('http://') || face.external_reference.startsWith('https://'))) {
      return {
        url: face.external_reference,
        file_id: null,
        file_type: 'image/jpeg',
        captured_at: face.captured_at,
      };
    }
    throw httpError(404, 'No face capture found for this registration');
  }

  async replaceBiometric(captureId, body, userId) {
    if (!isUuid(captureId)) throw httpError(422, 'Invalid capture id');
    const old = await biometricCaptureModel.findById(captureId);
    if (!old) throw httpError(404, 'Biometric capture not found');
    if (old.replaced_at) throw httpError(422, 'Capture has already been replaced');
    const registration = await registrationModel.findById(old.registration_id);
    await this.assertRegistrationAccess(userId, registration);

    const newPayload = {
      capture_type: old.capture_type,
      file_id: body.file_id,
      external_reference: body.external_reference,
      confirmed: body.confirmed,
      quality_score: body.quality_score,
      device_metadata: body.device_metadata,
      captured_at: body.captured_at,
    };
    const v = validateBiometricPayload(newPayload);
    if (!v.ok) throw httpError(422, v.error);
    const capturedAt = body.captured_at ? new Date(body.captured_at) : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      throw httpError(422, 'captured_at must be a valid ISO date');
    }

    let resolvedFileId = v.file_id;
    let resolvedFileUrl = null;
    if (old.capture_type === 'face') {
      const candidateId = v.file_id || (v.external_reference && isUuid(v.external_reference) ? v.external_reference : null);
      if (candidateId) {
        const file = await FileModel.findById(candidateId);
        if (file) {
          resolvedFileId = file.id;
          resolvedFileUrl = file.file_url ? String(file.file_url).trim() : null;
        } else if (v.file_id) {
          throw httpError(404, 'File not found');
        }
      } else if (v.external_reference && (v.external_reference.startsWith('http://') || v.external_reference.startsWith('https://'))) {
        resolvedFileUrl = v.external_reference.trim();
      }
    }

    await biometricCaptureModel.markReplaced(captureId);
    let row;
    try {
      row = await biometricCaptureModel.create({
        registration_id: old.registration_id,
        capture_type: old.capture_type,
        file_id: resolvedFileId || null,
        external_reference: resolvedFileId ? null : v.external_reference,
        quality_score: body.quality_score,
        device_metadata: body.device_metadata,
        captured_at: capturedAt.toISOString(),
      });
    } catch (e) {
      if (e.code === '23505') {
        const captures = await biometricCaptureModel.findByRegistrationId(old.registration_id);
        for (const ex of captures.filter((c) => c.capture_type === old.capture_type && !c.replaced_at)) {
          await biometricCaptureModel.markReplaced(ex.id);
        }
        row = await biometricCaptureModel.create({
          registration_id: old.registration_id,
          capture_type: old.capture_type,
          file_id: resolvedFileId || null,
          external_reference: resolvedFileId ? null : v.external_reference,
          quality_score: body.quality_score,
          device_metadata: body.device_metadata,
          captured_at: capturedAt.toISOString(),
        });
      } else {
        throw e;
      }
    }
    if (old.capture_type === 'face') {
      await applyFaceSelfieToProfile(registration, resolvedFileId || resolvedFileUrl || v.external_reference);
    }
    return row;
  }

  async deleteBiometric(captureId, userId) {
    if (!isUuid(captureId)) throw httpError(422, 'Invalid capture id');
    const row = await biometricCaptureModel.findById(captureId);
    if (!row) throw httpError(404, 'Biometric capture not found');
    const registration = await registrationModel.findById(row.registration_id);
    await this.assertRegistrationAccess(userId, registration);
    const deleted = await biometricCaptureModel.deleteById(captureId);
    return deleted;
  }
}

module.exports = new IdentityService();
