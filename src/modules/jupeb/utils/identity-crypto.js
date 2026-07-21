const crypto = require('crypto');

/** Stored when fingerprint is confirmed via boolean (no client token to send). */
const DEVICE_LOCAL_FINGERPRINT_REF = 'device_local_auth';

function normalizeNin(raw) {
  if (raw === undefined || raw === null) return '';
  return String(raw).replace(/\D/g, '');
}

function hashNin(normalizedNin) {
  return crypto.createHash('sha256').update(normalizedNin, 'utf8').digest('hex');
}

function ninLast4(normalizedNin) {
  if (normalizedNin.length < 4) return normalizedNin.padStart(4, '0');
  return normalizedNin.slice(-4);
}

function isTruthyConfirmed(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

/**
 * Normalize + validate biometric create/replace body.
 * Face: exactly one of file_id | external_reference.
 * Fingerprint: confirmed: true (preferred) and/or external_reference; no file_id.
 *
 * @returns {{ ok: true, file_id: string|null, external_reference: string|null } | { ok: false, error: string }}
 */
function validateBiometricPayload(body) {
  if (!body || typeof body.capture_type !== 'string') {
    return { ok: false, error: 'capture_type is required' };
  }
  if (!['face', 'fingerprint'].includes(body.capture_type)) {
    return { ok: false, error: 'capture_type must be face or fingerprint' };
  }

  const hasFile = Boolean(body.file_id);
  const hasExt = Boolean(body.external_reference && String(body.external_reference).trim());
  const confirmed = isTruthyConfirmed(body.confirmed);

  if (body.capture_type === 'fingerprint') {
    if (hasFile) {
      return {
        ok: false,
        error: 'fingerprint cannot use file_id; send confirmed: true (or external_reference)',
      };
    }
    if (!confirmed && !hasExt) {
      return {
        ok: false,
        error: 'fingerprint requires confirmed: true (or external_reference)',
      };
    }
    return {
      ok: true,
      file_id: null,
      external_reference: hasExt
        ? String(body.external_reference).trim()
        : DEVICE_LOCAL_FINGERPRINT_REF,
    };
  }

  // face
  if (confirmed) {
    return { ok: false, error: 'confirmed is only valid for fingerprint captures' };
  }
  if (hasFile === hasExt) {
    return { ok: false, error: 'Exactly one of file_id or external_reference is required' };
  }
  return {
    ok: true,
    file_id: hasFile ? body.file_id : null,
    external_reference: hasExt ? String(body.external_reference).trim() : null,
  };
}

module.exports = {
  normalizeNin,
  hashNin,
  ninLast4,
  validateBiometricPayload,
  DEVICE_LOCAL_FINGERPRINT_REF,
};
