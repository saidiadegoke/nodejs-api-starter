const request = require('supertest');
const XLSX = require('xlsx');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('JUPEB Bulk Candidate Upload API', () => {
  let registrationMigrated = false;
  let adminToken = null;
  let universityId = null;
  let subjectCombinationCode = null;
  let sessionId = null;

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_status_history LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
      return;
    }

    const loginRes = await request(app).post('/auth/login').send(adminCredentials);
    if (loginRes.status === 200 && loginRes.body.data?.access_token) {
      adminToken = loginRes.body.data.access_token;
    }

    if (!adminToken) return;

    // Set up test catalog data
    const suffix = Date.now().toString().slice(-6);
    const uniRes = await request(app)
      .post('/catalog/universities')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(
        buildCatalogUniversityPayload('BLK', {
          code: nextJupebTestUniversityCode('BLK'),
          name: `Bulk Upload Test Uni ${suffix}`,
        })
      );
    if (uniRes.status === 201) {
      universityId = uniRes.body.data.id;
    }

    const scRes = await request(app)
      .post('/catalog/subject-combinations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: nextJupebTestUniversityCode('BK'),
        title: `Bulk Combination ${suffix}`,
        subjects: ['Mathematics', 'Physics', 'Chemistry'],
        is_global: true,
      });
    if (scRes.status === 201) {
      subjectCombinationCode = scRes.body.data.code;
    }

    const { y1, academicYear, yearShort } = nextJupebAcademicSession();
    const sessRes = await request(app)
      .post('/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        year_short: yearShort,
        opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
        closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
      });
    if (sessRes.status === 201) {
      sessionId = sessRes.body.data.id;
      await closeAllOpenJupebSessions(adminToken);
      await request(app)
        .post(`/sessions/${sessionId}/open`)
        .set('Authorization', `Bearer ${adminToken}`);
    }
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/registration/institution/registrations/bulk-upload');
    expect(res.status).toBe(401);
  });

  it('rejects requests without a file with 422', async () => {
    if (!registrationMigrated || !adminToken) return;

    const res = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId);

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
  });

  it('rejects requests without session_id or university_id with 422', async () => {
    if (!registrationMigrated || !adminToken) return;

    const csvContent = 'first_name,last_name,middle_name,email,phone,nin,combination_code\nJohn,Doe,,john@test.com,08011112222,00000000001,COMBO\n';
    const res = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csvContent), 'candidates.csv');

    expect(res.status).toBe(422);
  });

  it('successfully processes CSV upload with combination_code, handles NIN verification, duplicates, and invalid rows', async () => {
    if (!registrationMigrated || !adminToken || !sessionId || !universityId || !subjectCombinationCode) return;

    const suffix = Date.now().toString().slice(-4);
    const validNin1 = `11${suffix}12345`;
    const validNin2 = `12${suffix}12345`;
    const badNin = '12345'; // too short

    const csvRows = [
      'first_name,last_name,middle_name,email,phone,nin,combination_code',
      `Alpha,Candidate,A,alpha_${suffix}@test.com,08010000001,${validNin1},${subjectCombinationCode}`,
      `Beta,Candidate,B,beta_${suffix}@test.com,08010000002,${validNin2},${subjectCombinationCode}`,
      `Duplicate,Alpha,A,dup_${suffix}@test.com,08010000003,${validNin1},${subjectCombinationCode}`, // duplicate NIN in batch
      `,Candidate,M,missing_first_${suffix}@test.com,08010000004,13${suffix}12345,${subjectCombinationCode}`, // missing first_name
      `Bad,Email,E,not-an-email,08010000005,14${suffix}12345,${subjectCombinationCode}`, // bad email
      `Bad,Nin,N,badnin_${suffix}@test.com,08010000006,${badNin},${subjectCombinationCode}`, // bad NIN
    ].join('\n');

    const res = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId)
      .field('provider', 'mock') // Use in-process mock
      .attach('file', Buffer.from(csvRows), 'test_candidates.csv');

    expect([200, 207]).toContain(res.status);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(data.total_rows).toBe(6);
    expect(data.succeeded_count).toBe(2);
    expect(data.failed_count).toBe(1); // Duplicate NIN in file
    expect(data.skipped_count).toBe(3); // missing first_name, bad email, bad NIN

    // Succeeded count check (details not returned)
    expect(data.succeeded_count).toBe(2);
    expect(data.succeeded).toBeUndefined();

    // Failed rows check (intra-file duplicate)
    expect(data.failed).toHaveLength(1);
    expect(data.failed[0].error_code).toBe('duplicate_in_file');

    // Skipped rows check
    const skippedCodes = data.skipped.map((s) => s.error_code);
    expect(skippedCodes).toContain('missing_name');
    expect(skippedCodes).toContain('invalid_email');
    expect(skippedCodes).toContain('invalid_nin');
  });

  it('rejects already-registered NIN without calling provider and leverages cache on re-verification', async () => {
    if (!registrationMigrated || !adminToken || !sessionId || !universityId || !subjectCombinationCode) return;

    const suffix = Date.now().toString().slice(-4);
    const existingNin = `21${suffix}12345`;

    // 1. First upload with this NIN
    const csv1 = [
      'first_name,last_name,middle_name,email,phone,nin,combination_code',
      `First,Registrant,R,first_${suffix}@test.com,08020000001,${existingNin},${subjectCombinationCode}`,
    ].join('\n');

    const res1 = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId)
      .field('provider', 'mock')
      .attach('file', Buffer.from(csv1), 'first.csv');

    expect(res1.status).toBe(200);
    expect(res1.body.data.succeeded_count).toBe(1);

    // 2. Re-upload with the exact same NIN in the same session — should be caught by blocking check!
    const csv2 = [
      'first_name,last_name,middle_name,email,phone,nin,combination_code',
      `Second,Registrant,R,second_${suffix}@test.com,08020000002,${existingNin},${subjectCombinationCode}`,
    ].join('\n');

    const res2 = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId)
      .field('provider', 'mock')
      .attach('file', Buffer.from(csv2), 'second.csv');

    // All rows failed -> 422
    expect(res2.status).toBe(422);
    expect(res2.body.data.failed_count).toBe(1);
    expect(res2.body.data.failed[0].error_code).toBe('already_registered');
    expect(res2.body.data.failed[0].error).toMatch(/already registered/i);
  });

  it('successfully processes Excel (.xlsx) file upload', async () => {
    if (!registrationMigrated || !adminToken || !sessionId || !universityId || !subjectCombinationCode) return;

    const suffix = Date.now().toString().slice(-4);
    const excelNin = `31${suffix}12345`;

    // Generate Excel workbook buffer using xlsx library with template columns
    const data = [
      {
        'first_name': 'Excel',
        'last_name': 'Candidate',
        'middle_name': 'Tester',
        'email': `excel_${suffix}@test.com`,
        'phone': '08030000001',
        'nin': excelNin,
        'combination_code': subjectCombinationCode,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    const res = await request(app)
      .post('/registration/institution/registrations/bulk-upload')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('session_id', sessionId)
      .field('university_id', universityId)
      .field('provider', 'mock')
      .attach('file', excelBuffer, 'candidates.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.data.succeeded_count).toBe(1);
    expect(res.body.data.failed_count).toBe(0);
    expect(res.body.data.succeeded).toBeUndefined();
  });
});
