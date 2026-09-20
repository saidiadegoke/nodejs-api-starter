const crypto = require('crypto');
const request = require('supertest');
const app = require('../app');

/** Ensures no other session is open so POST .../open can succeed (single-open-session rule). */
async function closeAllOpenJupebSessions(token) {
  const res = await request(app).get('/sessions?status=open&limit=100').set('Authorization', `Bearer ${token}`);
  if (res.status !== 200 || !Array.isArray(res.body.data)) return;
  for (const row of res.body.data) {
    await request(app).post(`/sessions/${row.id}/close`).set('Authorization', `Bearer ${token}`);
  }
}

/**
 * `jupeb_prefix` is a CHAR(3) with a partial unique index on the live rows;
 * the value space is therefore only 100..999 (900 slots). Test DBs that have
 * accumulated rows across runs can saturate large fractions of that space —
 * a purely sequential / random generator then collides often, which 409s
 * tests that lack their own retry loops.
 *
 * Strategy: keep an in-process set of already-issued prefixes so a single
 * test process never re-emits the same value, AND seed that set with the
 * prefixes already occupied in the DB (loaded once at test bootstrap via
 * `warmJupebPrefixCache`). The combination drives the cross-run collision
 * rate near zero without changing the caller signature.
 */
async function warmJupebPrefixCache(pool) {
  if (!pool) return;
  // Prefixes — jupeb_universities.jupeb_prefix unique on live rows.
  try {
    const r = await pool.query(
      `SELECT jupeb_prefix
         FROM jupeb_universities
        WHERE deleted_at IS NULL AND jupeb_prefix IS NOT NULL`
    );
    for (const row of r.rows) {
      if (row.jupeb_prefix) _issuedPrefixes.add(String(row.jupeb_prefix));
    }
  } catch {
    // Best-effort: if the table doesn't exist yet (fresh DB), the helper
    // will fall back to in-process uniqueness only.
  }
  // Academic years — jupeb_registration_sessions.academic_year is unique.
  try {
    const r = await pool.query(
      `SELECT academic_year FROM jupeb_registration_sessions WHERE academic_year IS NOT NULL`
    );
    for (const row of r.rows) {
      if (row.academic_year) _issuedSessionYears.add(String(row.academic_year));
    }
  } catch {
    // Best-effort — same fallback.
  }
}
// Pre-shuffle the 100..999 space so a caller's retry loop walks
// uncorrelated values instead of clusters of consecutive DB-occupied ones.
// `_issuedPrefixes` prevents in-process duplicates; cross-run collisions
// (DB has the prefix from a prior run) are still possible and remain the
// caller's responsibility to retry on 409.
const _issuedPrefixes = new Set();
const _prefixPool = (() => {
  const arr = [];
  for (let i = 0; i < 900; i += 1) arr.push(String(100 + i));
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();
let _prefixCursor = 0;
function nextJupebTestPrefix() {
  for (let i = 0; i < _prefixPool.length; i += 1) {
    const candidate = _prefixPool[_prefixCursor];
    _prefixCursor = (_prefixCursor + 1) % _prefixPool.length;
    if (!_issuedPrefixes.has(candidate)) {
      _issuedPrefixes.add(candidate);
      return candidate;
    }
  }
  // Pool exhausted in-process — recycle. Caller must retry on 409.
  return String(100 + crypto.randomInt(0, 900));
}

/** Alphanumeric university / catalog codes up to VARCHAR(20), unique across runs. */
function nextJupebTestUniversityCode(tag = 'U') {
  const head = String(tag || 'U').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'U';
  const tail = `${Date.now()}${crypto.randomInt(0, 1e9)}`;
  return `${head}${tail}`.slice(0, 20);
}

// jupeb_registration_sessions.academic_year is globally UNIQUE. Skip
// in-process duplicates and DB-occupied values (loaded once via
// `warmJupebPrefixCache`) so cross-run collisions don't 409 tests
// without their own retry loops.
const _issuedSessionYears = new Set();
let _sessionYearSeq = 0;
const _sessionYearBase = 3000 + crypto.randomInt(0, 6000);
function nextJupebAcademicSession() {
  // Look up to several thousand slots ahead before giving up.
  for (let i = 0; i < 5000; i += 1) {
    _sessionYearSeq += 1;
    const y1 = _sessionYearBase + _sessionYearSeq * 7;
    const academicYear = `${y1}/${y1 + 1}`;
    if (!_issuedSessionYears.has(academicYear)) {
      _issuedSessionYears.add(academicYear);
      return { y1, academicYear, yearShort: String(y1 + 1).slice(-2) };
    }
  }
  // Cache saturated — fall back; the caller's retry loop handles the rest.
  const y1 = _sessionYearBase + _sessionYearSeq * 7;
  return { y1, academicYear: `${y1}/${y1 + 1}`, yearShort: String(y1 + 1).slice(-2) };
}

/** Default payload for POST /catalog/universities (email required for institution_admin). */
function buildCatalogUniversityPayload(tag = 'U', overrides = {}) {
  const ts = Date.now();
  const tagSafe = String(tag || 'U').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'U';
  return {
    code: nextJupebTestUniversityCode(tag),
    name: overrides.name || `Test Uni ${tagSafe} ${ts}`,
    jupeb_prefix: nextJupebTestPrefix(),
    email: overrides.email || `catalog-${tagSafe}-${ts}@example.com`,
    ...overrides,
  };
}

/**
 * Obtains valid fixtures (sessionId, universityId, subjectCombinationId)
 * for registration testing by reusing existing seeded rows.
 * This prevents polluting the database with dummy sessions, fake universities,
 * dummy subject combinations, and fake subjects during testing.
 */
async function ensureTestRegistrationFixtures(pool, token, tag = 'TEST') {
  let sessionId;
  let universityId;
  let subjectCombinationId;

  if (pool) {
    // 1. Session: Re-use active open session (e.g. 2026/2027)
    try {
      const sessRes = await pool.query(
        `SELECT id FROM jupeb_registration_sessions WHERE status = 'open' ORDER BY academic_year DESC LIMIT 1`
      );
      if (sessRes.rows[0]) {
        sessionId = sessRes.rows[0].id;
      } else {
        // Re-open standard 20xx/20xx session if one exists
        const standardSess = await pool.query(
          `SELECT id FROM jupeb_registration_sessions WHERE academic_year ~ '^20[0-9]{2}/20[0-9]{2}$' ORDER BY academic_year DESC LIMIT 1`
        );
        if (standardSess.rows[0]) {
          await pool.query(`UPDATE jupeb_registration_sessions SET status = 'open' WHERE id = $1`, [standardSess.rows[0].id]);
          sessionId = standardSess.rows[0].id;
        }
      }
    } catch { /* ignore */ }

    // 2. University: Re-use existing live university (UNILAG, FUTA, etc.)
    try {
      const uniRes = await pool.query(
        `SELECT id FROM jupeb_universities WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
      );
      if (uniRes.rows[0]) {
        universityId = uniRes.rows[0].id;
      }
    } catch { /* ignore */ }

    // 3. Subject Combination: Re-use existing live subject combination
    try {
      const scRes = await pool.query(
        `SELECT id FROM jupeb_subject_combinations WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
      );
      if (scRes.rows[0]) {
        subjectCombinationId = scRes.rows[0].id;
      }
    } catch { /* ignore */ }
  }

  // Fallback creation ONLY if DB was unseeded
  if (!universityId && token) {
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${token}`)
      .send(buildCatalogUniversityPayload(tag, { name: `${tag} University` }));
    if (uniRes.status === 201) universityId = uniRes.body.data?.id;
  }

  if (!subjectCombinationId && token) {
    // ALWAYS use standard JUPEB subjects ('MTH', 'PHY', 'CHM') — NEVER fake 'A', 'B', 'C'
    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: nextJupebTestUniversityCode(`${tag}SC`),
        title: `${tag} Combo`,
        subjects: ['MTH', 'PHY', 'CHM'],
        is_global: true,
      });
    if (scRes.status === 201) subjectCombinationId = scRes.body.data?.id;
  }

  if (!sessionId && token) {
    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    if (sessRes.status === 201) {
      sessionId = sessRes.body.data?.id;
      await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${token}`);
    }
  }

  return { sessionId, universityId, subjectCombinationId };
}

/**
 * Restores the default open JUPEB session (20xx/20xx) and removes temporary test sessions.
 */
async function restoreDefaultJupebSession(pool) {
  if (!pool) return;
  try {
    await pool.query(
      `DELETE FROM jupeb_registration_sessions WHERE academic_year !~ '^20[0-9]{2}/20[0-9]{2}$'`
    );
    const openRes = await pool.query(
      `SELECT id FROM jupeb_registration_sessions WHERE status = 'open' AND academic_year ~ '^20[0-9]{2}/20[0-9]{2}$' LIMIT 1`
    );
    if (openRes.rowCount === 0) {
      await pool.query(
        `UPDATE jupeb_registration_sessions 
         SET status = 'open' 
         WHERE id = (
           SELECT id FROM jupeb_registration_sessions 
           WHERE academic_year ~ '^20[0-9]{2}/20[0-9]{2}$' 
           ORDER BY academic_year DESC LIMIT 1
         )`
      );
    }
  } catch { /* ignore */ }
}

/**
 * Cleans up temporary test subjects, test combinations, and test sessions.
 */
async function cleanupTestCatalogArtifacts(pool) {
  if (!pool) return;
  try {
    await restoreDefaultJupebSession(pool);
    const SEEDED_SUBJECTS = [
      'ACC', 'AGR', 'ART', 'BIO', 'BUS', 'CHM', 'CRS', 'ECO', 'FRE', 'GEO',
      'GOV', 'HIS', 'IGB', 'ISS', 'LIT', 'MTH', 'MUS', 'PHY', 'YOR',
    ];
    await pool.query(
      `DELETE FROM jupeb_subject_combination_items
       WHERE subject_id IN (
         SELECT id FROM jupeb_subjects
         WHERE UPPER(code) <> ALL($1::text[])
       )`,
      [SEEDED_SUBJECTS]
    );
    await pool.query(
      `DELETE FROM jupeb_subjects
       WHERE UPPER(code) <> ALL($1::text[])`,
      [SEEDED_SUBJECTS]
    );
    await pool.query(
      `DELETE FROM jupeb_subject_combinations
       WHERE code !~ '^JUPEB[ -]SC-[0-9]+[a-zA-Z]?$'`
    );
  } catch { /* ignore */ }
}

module.exports = {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  warmJupebPrefixCache,
  buildCatalogUniversityPayload,
  ensureTestRegistrationFixtures,
  restoreDefaultJupebSession,
  cleanupTestCatalogArtifacts,
};
