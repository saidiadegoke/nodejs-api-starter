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

/** `jupeb_prefix` is globally unique in DB (3 digits). Randomize to avoid collisions when many rows exist. */
function nextJupebTestPrefix() {
  return String(100 + crypto.randomInt(0, 900));
}

/** Alphanumeric university / catalog codes up to VARCHAR(20), unique across runs. */
function nextJupebTestUniversityCode(tag = 'U') {
  const head = String(tag || 'U').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) || 'U';
  const tail = `${Date.now()}${crypto.randomInt(0, 1e9)}`;
  return `${head}${tail}`.slice(0, 20);
}

let _sessionYearSeq = 0;
function nextJupebAcademicSession() {
  _sessionYearSeq += 1;
  const t = Date.now() + _sessionYearSeq;
  const y1 = 2300 + (t % 2500) * 2 + (_sessionYearSeq % 23);
  return {
    y1,
    academicYear: `${y1}/${y1 + 1}`,
    yearShort: String(y1 + 1).slice(-2),
  };
}

module.exports = {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
};
