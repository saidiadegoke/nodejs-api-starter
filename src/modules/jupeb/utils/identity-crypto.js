const crypto = require('crypto');

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

/**
 * @param {{ capture_type: string, file_id?: string, external_reference?: string }} body
 */
function validateBiometricPayload(body) {
  if (!body || typeof body.capture_type !== 'string') {
    return { ok: false, error: 'capture_type is required' };
  }
  if (!['face', 'fingerprint'].includes(body.capture_type)) {
    return { ok: false, error: 'capture_type must be face or fingerprint' };
  }
  const hasFile = Boolean(body.file_id);
  const hasExt = Boolean(body.external_reference);
  if (hasFile === hasExt) {
    return { ok: false, error: 'Exactly one of file_id or external_reference is required' };
  }
  return { ok: true };
}

module.exports = {
  normalizeNin,
  hashNin,
  ninLast4,
  validateBiometricPayload,
};
