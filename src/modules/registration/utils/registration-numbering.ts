import { DataSource } from 'typeorm';

// Crockford-ish base32 minus confusable chars (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Provisional candidate code: 3-digit university code + 4+ digit serial (no year).
 */
export function formatProvisionalCandidateCode(
  universityCodeOrPrefix: string | number | null | undefined,
  provisionalSerial: number | string | null | undefined,
): string {
  const pref = String(universityCodeOrPrefix ?? '')
    .replace(/\D/g, '')
    .slice(0, 3)
    .padStart(3, '0');
  const ser = Math.max(0, parseInt(String(provisionalSerial ?? ''), 10) || 0);
  return `${pref}${String(ser).padStart(4, '0')}`;
}

/**
 * Final candidate number: 2-digit session year short + 3-digit university code + 4+ digit serial.
 * Must satisfy DB check `^[0-9]{2}[0-9]{3}[0-9]{4,}$`.
 */
export function formatCandidateNumber(
  yearShort: string | number | null | undefined,
  universityCodeOrPrefix: string | number | null | undefined,
  provisionalSerial: number | string | null | undefined,
): string {
  const ys = String(yearShort ?? '')
    .replace(/\D/g, '')
    .slice(-2)
    .padStart(2, '0');
  const pref = String(universityCodeOrPrefix ?? '')
    .replace(/\D/g, '')
    .slice(0, 3)
    .padStart(3, '0');
  const ser = Math.max(0, parseInt(String(provisionalSerial ?? ''), 10) || 0);
  return `${ys}${pref}${String(ser).padStart(4, '0')}`;
}

/**
 * Opaque institution-issued registration code the candidate uses to onboard.
 */
export function makeInstitutionCode(): string {
  const len = Math.max(4, Math.min(16, parseInt(process.env.JUPEB_INSTITUTION_CODE_LENGTH || '', 10) || 6));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  const bytes: Buffer = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/**
 * Expiry for institution-issued codes. <=0 / unset TTL means the code never expires.
 */
export function institutionCodeExpiresAt(): Date | null {
  const raw = process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS;
  const hours = raw === undefined || raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return new Date(Date.now() + hours * 3600 * 1000);
}

/**
 * Allocate a unique institution-issued code, retrying on collision like the legacy
 * `generateUniqueInstitutionCode`.
 */
export async function generateUniqueInstitutionCode(dataSource: DataSource): Promise<string> {
  for (let i = 0; i < 24; i += 1) {
    const code = makeInstitutionCode();
    const existing = await dataSource.query(
      `SELECT 1 FROM jupeb_registrations WHERE institution_issued_code = $1 LIMIT 1`,
      [code],
    );
    if (!existing.length) return code;
  }
  throw new Error('Could not allocate institution code');
}
