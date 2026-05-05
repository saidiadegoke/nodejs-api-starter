/**
 * Final candidate number: 2-digit session year short + 3-digit university JUPEB prefix + 4+ digit serial.
 * Must satisfy DB check `^[0-9]{2}[0-9]{3}[0-9]{4,}$`.
 */
function formatCandidateNumber(yearShort, jupebPrefix, provisionalSerial) {
  const ys = String(yearShort ?? '')
    .replace(/\D/g, '')
    .slice(-2)
    .padStart(2, '0');
  const pref = String(jupebPrefix ?? '')
    .replace(/\D/g, '')
    .slice(0, 3)
    .padStart(3, '0');
  const ser = Math.max(0, parseInt(provisionalSerial, 10) || 0);
  return `${ys}${pref}${String(ser).padStart(4, '0')}`;
}

// Crockford-ish base32 minus confusable chars (no 0/O/1/I).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeInstitutionCode() {
  const len = Math.max(4, Math.min(16, parseInt(process.env.JUPEB_INSTITUTION_CODE_LENGTH, 10) || 6));
  // eslint-disable-next-line global-require
  const crypto = require('crypto');
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

module.exports = { formatCandidateNumber, makeInstitutionCode };
