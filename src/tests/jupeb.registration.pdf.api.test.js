const zlib = require('zlib');
const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

// PDFKit writes content streams as FlateDecode-compressed sequences of
// hex-encoded glyph runs (`[<48656c6c6f>] TJ`). To assert that visible text
// actually made it into the rendered PDF we have to decompress those streams
// and concatenate the decoded glyph hex.
function extractPdfText(buf) {
  let out = buf.toString('latin1');
  const needle = Buffer.from('stream\n');
  const end = Buffer.from('\nendstream');
  let i = 0;
  while (i < buf.length) {
    const s = buf.indexOf(needle, i);
    if (s < 0) break;
    const e = buf.indexOf(end, s + needle.length);
    if (e < 0) break;
    const data = buf.slice(s + needle.length, e);
    let decoded = '';
    try {
      decoded = zlib.inflateSync(data).toString('latin1');
    } catch {
      decoded = data.toString('latin1');
    }
    const hexRuns = decoded.match(/<[0-9A-Fa-f]+>/g) || [];
    for (const run of hexRuns) {
      out += Buffer.from(run.slice(1, -1), 'hex').toString('utf8');
    }
    i = e + end.length;
  }
  return out;
}

describe('GET /registration/me/registration-form.pdf (M.10)', () => {
  let registrationMigrated = false;
  let pdfkitAvailable = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    try {
      // eslint-disable-next-line global-require, import/no-unresolved
      require('pdfkit');
      pdfkitAvailable = true;
    } catch {
      pdfkitAvailable = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function newClaimedRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} PDF University`,
          short_name: `${tag}PDF`,
          jupeb_prefix: nextJupebTestPrefix(),
        });
      if (uniRes.status === 201) break;
    }
    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }
    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(adminToken);
    await request(app).post(`/sessions/${sessRes.body.data.id}/open`).set('Authorization', `Bearer ${adminToken}`);
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const reg = await request(app)
      .post('/auth/complete-registration')
      .send({
        code: createReg.body.data.institution_issued_code,
        password: 'Strong@Password1',
        email: `pdf-${tag.toLowerCase()}-${stamp}@example.com`,
        first_name: 'Ada',
        last_name: 'Tester',
      });
    return {
      studentToken: reg.body.data.access_token,
      registrationId: reg.body.data.registration.id,
      universityName: uniRes.body.data.name,
    };
  }

  it('returns 401 without auth', async () => {
    const res = await request(app).get('/registration/me/registration-form.pdf');
    expect(res.status).toBe(401);
  });

  it('returns 422 not_ready when registration is freshly claimed', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken } = await newClaimedRegistration(adminToken, 'NRDY');

    const res = await request(app)
      .get('/registration/me/registration-form.pdf')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.details && res.body.details.error_code).toBe('not_ready');
    expect(res.body.details.current_status).toBe('claimed');
  });

  it('streams a valid PDF (starts with %PDF) when registration is at pending_institution_review', async () => {
    if (!registrationMigrated || !pdfkitAvailable) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId, universityName } =
      await newClaimedRegistration(adminToken, 'PDFOK');

    // Bypass the submit flow — promote the registration directly. The PDF
    // endpoint just checks status; it doesn't run completeness validation.
    await pool.query(
      `UPDATE jupeb_registrations SET status = 'pending_institution_review', submitted_at = NOW() WHERE id = $1`,
      [registrationId]
    );

    const res = await request(app)
      .get('/registration/me/registration-form.pdf')
      .set('Authorization', `Bearer ${studentToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(c));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/registration-form-/);
    const body = res.body;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.length).toBeGreaterThan(500);
    expect(body.slice(0, 4).toString('ascii')).toBe('%PDF');

    const text = extractPdfText(body);
    expect(text).toMatch(/JUPEB Registration Form/);
    expect(text).toContain('Ada');
    expect(text).toContain(universityName.slice(0, 12));
  });

  it('also serves the PDF when status is approved', async () => {
    if (!registrationMigrated || !pdfkitAvailable) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const { studentToken, registrationId } = await newClaimedRegistration(adminToken, 'PDFOK2');

    await pool.query(
      `UPDATE jupeb_registrations SET status = 'approved', approved_at = NOW() WHERE id = $1`,
      [registrationId]
    );

    const res = await request(app)
      .get('/registration/me/registration-form.pdf')
      .set('Authorization', `Bearer ${studentToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks = [];
        response.on('data', (c) => chunks.push(c));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 4).toString('ascii')).toBe('%PDF');
  });
});
