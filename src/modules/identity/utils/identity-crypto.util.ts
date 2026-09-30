import * as crypto from 'crypto';

export const DEVICE_LOCAL_FINGERPRINT_REF = 'device_local_auth';

export function normalizeNin(raw?: string | number | null): string {
  if (raw === undefined || raw === null) return '';
  return String(raw).replace(/\D/g, '');
}

export function hashNin(normalizedNin: string): string {
  return crypto.createHash('sha256').update(normalizedNin, 'utf8').digest('hex');
}

export function ninLast4(normalizedNin: string): string {
  if (normalizedNin.length < 4) return normalizedNin.padStart(4, '0');
  return normalizedNin.slice(-4);
}

function isTruthyConfirmed(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export interface BiometricValidationSuccess {
  ok: true;
  file_id: string | null;
  external_reference: string | null;
}

export interface BiometricValidationFailure {
  ok: false;
  error: string;
}

export type BiometricValidationResult =
  | BiometricValidationSuccess
  | BiometricValidationFailure;

export function validateBiometricPayload(body: Record<string, any>): BiometricValidationResult {
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
