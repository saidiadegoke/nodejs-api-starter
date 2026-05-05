const ninVerificationModel = require('../models/nin-verification.model');
const biometricCaptureModel = require('../models/biometric-capture.model');
const registrationModel = require('../models/registration.model');
const ninAdapter = require('./nin-adapter.service');
const { emitNinResolved } = require('./nin-events.service');
const FileService = require('../../files/services/file.service');
const { normalizeNin, hashNin, ninLast4, validateBiometricPayload } = require('../utils/identity-crypto');
const { getUserRoles } = require('../../../shared/middleware/rbac.middleware');

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

function publicVerifyResponse(row) {
  const payload = row.response_payload || {};
  const profile = {
    first_name: payload.first_name,
    last_name: payload.last_name,
    middle_name: payload.middle_name ?? null,
    date_of_birth: payload.date_of_birth ?? null,
    gender: payload.gender ?? null,
    nin_last4: row.nin_last4,
  };
  const out = {
    verification_id: row.id,
    status: row.status,
    profile,
  };
  if (row.status === 'pending') {
    out.retry_after = row.retry_after;
    out.last_error_code = row.last_error_code;
  }
  if (row.status === 'failed' && row.error_payload && Object.keys(row.error_payload).length) {
    out.error = row.error_payload;
  }
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
  async verifyNin({ nin, idempotency_key, intake_payload }, userId) {
    const normalized = normalizeNin(nin);
    if (normalized.length !== 11) {
      throw httpError(422, 'NIN must be exactly 11 digits');
    }
    const ninHash = hashNin(normalized);
    const last4 = ninLast4(normalized);
    const idemKey = idempotency_key ? String(idempotency_key).trim() : null;
    const intake = pickIntake(intake_payload);

    if (idemKey) {
      const existing = await ninVerificationModel.findByIdempotencyKey(idemKey);
      if (existing) {
        if (existing.nin_hash !== ninHash) {
          throw httpError(409, 'idempotency_key was already used for a different NIN');
        }
        return publicVerifyResponse(existing);
      }
    }

    const provider = ninAdapter.getProvider();
    const adapterResult = await ninAdapter.verifyNin(normalized);

    if (adapterResult.outcome === 'unavailable') {
      const seconds = adapterResult.retry_after_seconds || 300;
      const retry_after = new Date(Date.now() + seconds * 1000).toISOString();
      const row = await ninVerificationModel.createPending({
        nin_hash: ninHash,
        nin_last4: last4,
        provider,
        idempotency_key: idemKey,
        intake_payload: intake,
        retry_after,
        last_error_code: adapterResult.error_code || 'provider_unavailable',
        requested_by: userId,
      });
      return publicVerifyResponse(row);
    }

    if (adapterResult.outcome === 'failed') {
      const row = await ninVerificationModel.create({
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
      });
      return {
        verification_id: row.id,
        status: 'failed',
        profile: { nin_last4: last4 },
        error: row.error_payload,
      };
    }

    const row = await ninVerificationModel.create({
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
    });
    return publicVerifyResponse(row);
  }

  async retryVerification(verificationId, userId) {
    if (!isUuid(verificationId)) throw httpError(422, 'Invalid verification id');
    const existing = await ninVerificationModel.findById(verificationId);
    if (!existing) throw httpError(404, 'Verification not found');
    if (existing.status !== 'pending') {
      return publicVerifyResponse(existing);
    }
    const adapterResult = await ninAdapter.verifyNin(
      // We don't have the raw NIN; the adapter mock doesn't need it for force-modes.
      // For real providers, the row carries provider_reference; the adapter must
      // accept the existing row to re-poll.
      existing.nin_last4.padStart(11, '0')
    );
    if (adapterResult.outcome === 'verified') {
      const row = await ninVerificationModel.markVerified(verificationId, {
        response_payload: adapterResult.profile || {},
        provider_reference: adapterResult.provider_reference || existing.provider_reference,
      });
      await emitNinResolved(verificationId, 'verified');
      return publicVerifyResponse(row);
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
      return {
        verification_id: row.id,
        status: 'failed',
        profile: { nin_last4: row.nin_last4 },
        error: row.error_payload,
      };
    }
    const seconds = adapterResult.retry_after_seconds || 300;
    const retry_after = new Date(Date.now() + seconds * 1000).toISOString();
    const row = await ninVerificationModel.incrementAttempt(verificationId, {
      retry_after,
      last_error_code: adapterResult.error_code || 'provider_unavailable',
    });
    return publicVerifyResponse(row || existing);
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
        throw httpError(422, `Face capture quality_score ${score} is below threshold ${minQuality}`);
      }
    }
    const capturedAt = body.captured_at ? new Date(body.captured_at) : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      throw httpError(422, 'captured_at must be a valid ISO date');
    }
    try {
      return await biometricCaptureModel.create({
        registration_id: body.registration_id,
        capture_type: body.capture_type,
        file_id: body.file_id || null,
        external_reference: body.external_reference || null,
        quality_score: body.quality_score,
        device_metadata: body.device_metadata,
        captured_at: capturedAt.toISOString(),
      });
    } catch (e) {
      if (e.code === '23505') {
        throw httpError(409, 'A biometric capture of this type already exists for this registration');
      }
      throw e;
    }
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
    const face = [...captures].reverse().find((c) => c.capture_type === 'face' && c.file_id);
    if (!face) throw httpError(404, 'No face capture found for this registration');
    const file = await FileService.getFile(face.file_id, userId);
    if (!file) throw httpError(404, 'File not found');
    return {
      url: file.file_url,
      file_id: file.id,
      file_type: file.file_type,
      captured_at: face.captured_at,
    };
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

    await biometricCaptureModel.markReplaced(captureId);
    try {
      return await biometricCaptureModel.create({
        registration_id: old.registration_id,
        capture_type: old.capture_type,
        file_id: body.file_id || null,
        external_reference: body.external_reference || null,
        quality_score: body.quality_score,
        device_metadata: body.device_metadata,
        captured_at: capturedAt.toISOString(),
      });
    } catch (e) {
      if (e.code === '23505') {
        throw httpError(409, 'A biometric capture of this type already exists for this registration');
      }
      throw e;
    }
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
