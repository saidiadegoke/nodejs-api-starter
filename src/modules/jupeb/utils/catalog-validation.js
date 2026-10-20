/**
 * Cleans a university code by stripping leading apostrophes/quotes (common Excel text prefix e.g. '006 or '102)
 * and padding 1-2 digit numbers to 3 digits.
 * @param {string|number} code
 * @returns {string}
 */
function cleanUniversityCode(code) {
  if (code == null) return '';
  let str = String(code).trim().replace(/^['’`"]+/, '').trim();
  if (/^\d{1,2}$/.test(str)) {
    str = str.padStart(3, '0');
  }
  return str;
}

/**
 * Validates that university code is a 3-digit numeric string.
 * @param {string|number} code
 * @returns {{ ok: boolean, error?: string, code?: string }}
 */
function validateUniversityCode(code) {
  const cleaned = cleanUniversityCode(code);
  if (!/^[0-9]{3}$/.test(cleaned)) {
    return { ok: false, error: 'code must be exactly 3 numeric characters' };
  }
  return { ok: true, code: cleaned };
}

/**
 * Cleans a jupeb_prefix by stripping leading apostrophes/quotes and uppercasing.
 * @param {string|number} prefix
 * @returns {string}
 */
function cleanJupebPrefix(prefix) {
  if (prefix == null) return '';
  return String(prefix).trim().replace(/^['’`"]+/, '').trim().toUpperCase();
}

/**
 * Validates jupeb_prefix as a 2-20 character university prefix / acronym (e.g. UNILAG, LASU).
 * @param {string|number} prefix
 * @returns {{ ok: boolean, error?: string, prefix?: string }}
 */
function validateJupebPrefix(prefix) {
  const cleaned = cleanJupebPrefix(prefix);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 20) {
    return { ok: false, error: 'jupeb_prefix must be between 2 and 20 characters' };
  }
  return { ok: true, prefix: cleaned };
}

/**
 * Trim, dedupe case-insensitively, enforce 3–6 subjects.
 * @param {unknown} raw
 * @returns {{ subjects: string[] | null, error: string | null }}
 */
function normalizeSubjects(raw) {
  if (!Array.isArray(raw)) {
    return { subjects: null, error: 'subjects must be an array of strings' };
  }
  const seen = new Map();
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { subjects: null, error: 'each subject must be a string' };
    }
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  const subjects = Array.from(seen.values());
  if (subjects.length < 3) {
    return { subjects: null, error: 'at least 3 unique subjects are required' };
  }
  if (subjects.length > 6) {
    return { subjects: null, error: 'at most 6 unique subjects are allowed' };
  }
  return { subjects, error: null };
}

module.exports = {
  cleanUniversityCode,
  validateUniversityCode,
  cleanJupebPrefix,
  validateJupebPrefix,
  normalizeSubjects,
};

