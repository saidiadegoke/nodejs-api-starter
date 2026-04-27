/**
 * @param {string} prefix
 * @returns {{ ok: boolean, error?: string }}
 */
function validateJupebPrefix(prefix) {
  if (typeof prefix !== 'string' || !/^[0-9]{3}$/.test(prefix.trim())) {
    return { ok: false, error: 'jupeb_prefix must be exactly 3 numeric characters' };
  }
  return { ok: true };
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
  validateJupebPrefix,
  normalizeSubjects,
};
