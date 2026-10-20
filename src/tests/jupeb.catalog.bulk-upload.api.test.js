/**
 * Bulk CSV upload accepts THREE shapes:
 *   - multipart/form-data with a file field (`file` or `csv`)
 *   - text/csv raw body
 *   - application/json { csv: "..." }
 *
 * Previously only the text/csv path worked; multipart uploads from the
 * frontend silently parsed to zero rows.
 */
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const { nextJupebTestPrefix } = require('./jupeb-session-test-helpers');

describe('Catalog bulk CSV upload — accepts multipart, raw csv, JSON', () => {
  const cleanupCodes = [];

  async function adminToken() {
    const r = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return r.body.data?.access_token;
  }

  afterAll(async () => {
    if (cleanupCodes.length) {
      await pool.query(
        `UPDATE jupeb_universities SET deleted_at = NOW() WHERE code = ANY($1::text[]) OR jupeb_prefix = ANY($1::text[])`,
        [cleanupCodes]
      );
    }
  });

  function uniqueCode(tag) {
    return `${tag}${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 18);
  }

  function makeCsv(codes) {
    const lines = ['code,name,jupeb_prefix,email'];
    for (const c of codes) {
      lines.push(`${c},${c} Probe Univ,${nextJupebTestPrefix()},bulk-${c}@example.com`);
    }
    cleanupCodes.push(...codes);
    return lines.join('\n');
  }

  it('multipart file field=`file` parses and inserts every row', async () => {
    const token = await adminToken();
    if (!token) return;
    const codes = [uniqueCode('FA'), uniqueCode('FB')];
    const csv = makeCsv(codes);
    const r = await request(app)
      .post('/catalog/universities/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'unis.csv', contentType: 'text/csv' });
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(2);
    expect(r.body.data.succeeded).toBe(2);
  });

  it('multipart file field=`csv` also parses (flexible field name)', async () => {
    const token = await adminToken();
    if (!token) return;
    const codes = [uniqueCode('CA'), uniqueCode('CB')];
    const csv = makeCsv(codes);
    const r = await request(app)
      .post('/catalog/universities/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('csv', Buffer.from(csv), { filename: 'unis.csv', contentType: 'text/csv' });
    expect(r.status).toBe(200);
    expect(r.body.data.succeeded).toBe(2);
  });

  it('text/csv raw body still works (regression — original shape)', async () => {
    const token = await adminToken();
    if (!token) return;
    const codes = [uniqueCode('TA'), uniqueCode('TB')];
    const csv = makeCsv(codes);
    const r = await request(app)
      .post('/catalog/universities/bulk')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/csv')
      .send(csv);
    expect(r.status).toBe(200);
    expect(r.body.data.succeeded).toBe(2);
  });

  it('JSON { csv: "..." } body works', async () => {
    const token = await adminToken();
    if (!token) return;
    const codes = [uniqueCode('JA'), uniqueCode('JB')];
    const csv = makeCsv(codes);
    const r = await request(app)
      .post('/catalog/universities/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv });
    expect(r.status).toBe(200);
    expect(r.body.data.succeeded).toBe(2);
  });

  it('captures per-row failures without aborting the run', async () => {
    const token = await adminToken();
    if (!token) return;
    const dup = uniqueCode('DU');
    // First row succeeds; second row collides on code with the first.
    const csv = `code,name,jupeb_prefix,email
${dup},First Probe,${nextJupebTestPrefix()},first-${dup}@example.com
${dup},Dup Probe,${nextJupebTestPrefix()},dup-${dup}@example.com`;
    cleanupCodes.push(dup);
    const r = await request(app)
      .post('/catalog/universities/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'unis.csv', contentType: 'text/csv' });
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(2);
    expect(r.body.data.succeeded).toBe(1);
    expect(r.body.data.failed).toBe(1);
    expect(r.body.data.outcomes[1].ok).toBe(false);
    expect(r.body.data.outcomes[1].error_message).toMatch(/duplicate|conflict|already/i);
  });

  it('handles Excel (.xlsx) upload with leading apostrophe in jupeb_prefix and strips empty rows', async () => {
    const XLSX = require('xlsx');
    const token = await adminToken();
    if (!token) return;
    const code = uniqueCode('XU');
    cleanupCodes.push(code);

    const prefix = nextJupebTestPrefix();
    const data = [
      {
        code,
        name: `${code} Excel Univ`,
        jupeb_prefix: `'${prefix}`, // leading apostrophe
        email: `excel-${code}@example.com`,
      },
      // Empty rows
      { code: '', name: '', jupeb_prefix: '', email: '' },
      { code: '', name: '', jupeb_prefix: '', email: '' },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Universities');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    const r = await request(app)
      .post('/catalog/universities/bulk')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, { filename: 'unis.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(1); // Stripped empty rows
    expect(r.body.data.succeeded).toBe(1);
  });
});
