const ninVerificationModel = require('../models/nin-verification.model');
const biometricCaptureModel = require('../models/biometric-capture.model');
const registrationModel = require('../models/registration.model');
const ninAdapter = require('./nin-adapter.service');
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
  return {
    verification_id: row.id,
    status: row.status,
    profile,
  };
}

class IdentityService {
  async verifyNin({ nin, idempotency_key }, userId) {
    const normalized = normalizeNin(nin);
    if (normalized.length !== 11) {
      throw httpError(422, 'NIN must be exactly 11 digits');
    }
    const ninHash = hashNin(normalized);
    const last4 = ninLast4(normalized);
    if (idempotency_key) {
      const existing = await ninVerificationModel.findByIdempotencyKey(String(idempotency_key).trim());
      if (existing) {
        if (existing.nin_hash !== ninHash) {
          throw httpError(409, 'idempotency_key was already used for a different NIN');
        }
        return publicVerifyResponse(existing);
      }
    }
    const provider = ninAdapter.getProvider();
    const adapterResult = await ninAdapter.verifyNin(normalized);
    if (!adapterResult.ok) {
      const row = await ninVerificationModel.create({
        nin_hash: ninHash,
        nin_last4: last4,
        provider,
        provider_reference: adapterResult.provider_reference || null,
        idempotency_key: idempotency_key ? String(idempotency_key).trim() : null,
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
    const responsePayload = {
      ...adapterResult.profile,
    };
    const row = await ninVerificationModel.create({
      nin_hash: ninHash,
      nin_last4: last4,
      provider,
      provider_reference: adapterResult.provider_reference || null,
      idempotency_key: idempotency_key ? String(idempotency_key).trim() : null,
      status: 'verified',
      response_payload: responsePayload,
      error_payload: {},
      verified_at: new Date().toISOString(),
      requested_by: userId,
    });
    return publicVerifyResponse(row);
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

  async listBiometrics(registrationId, userId) {
    if (!isUuid(registrationId)) throw httpError(422, 'Invalid registration id');
    const registration = await registrationModel.findById(registrationId);
    await this.assertRegistrationAccess(userId, registration);
    return biometricCaptureModel.findByRegistrationId(registrationId);
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
