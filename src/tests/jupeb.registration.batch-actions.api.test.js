const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Institution batch actions + withdraw (013 §E.7 / §E.8)', () => {
  let registrationMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }
    process.env.JUPEB_INSTITUTION_CODE_TTL_HOURS = '0';
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  async function makeFixtures(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} Batch University`,
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
          subjects: ['M', 'P', 'C'],
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
    return {
      sessionId: sessRes.body.data.id,
      universityId: uniRes.body.data.id,
      subjectCombinationId: scRes.body.data.id,
    };
  }

  /**
   * Create a registration via the institution endpoint and seed it to an
   * arbitrary status (for terminal-state and pending-state cases) without
   * forcing the full submit pipeline.
   */
  async function createAtStatus(adminToken, fixtures, tag, status) {
    const created = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: fixtures.sessionId,
        university_id: fixtures.universityId,
        subject_combination_id: fixtures.subjectCombinationId,
      });
    expect(created.status).toBe(201);
    const registrationId = created.body.data.id;
    if (status && status !== 'code_issued') {
      await pool.query(
        `UPDATE jupeb_registrations SET status = $1 WHERE id = $2`,
        [status, registrationId]
      );
    }
    return registrationId;
  }

  it('POST /institution/registrations/batch rejects empty ids[] with 422', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [], action: 'approve' });
    expect(res.status).toBe(422);
  });

  it('rejects invalid action', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: ['00000000-0000-1000-8000-000000000000'], action: 'archive' });
    expect(res.status).toBe(422);
  });

  it('rejects "reject" action without reason', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: ['00000000-0000-1000-8000-000000000000'], action: 'reject' });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/reason/i);
  });

  it('batch approve splits accepted vs rejected per row, never short-circuits', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'BAOK');

    // r1: in pending_institution_review WITH a verified NIN linkage  → should approve
    const ninA = `2${String(Date.now()).slice(-10)}`;
    const verifyA = await request(app)
      .post('/identity/nin/verify')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nin: ninA, provider: 'mock', idempotency_key: `idem-batch-A-${Date.now()}` });
    if (verifyA.body.data?.status !== 'verified') return;
    const r1 = await pool.query(
      `INSERT INTO jupeb_registrations
         (session_id, university_id, subject_combination_id, nin_verification_id,
          institution_issued_code, provisional_serial, provisional_candidate_code,
          status, created_by, institution_code_expires_at)
       VALUES ($1,$2,$3,$4,'BATCHA01',1,'2510100001','pending_institution_review',
               (SELECT id FROM users WHERE email='admin@example.com' LIMIT 1), NOW() + INTERVAL '1 day')
       RETURNING id`,
      [fixtures.sessionId, fixtures.universityId, fixtures.subjectCombinationId, verifyA.body.data.verification_id]
    ).catch(async () => {
      // fall back: create via API and force status, accept that NIN gate may fail
      const id = await createAtStatus(adminToken, fixtures, 'A', 'pending_institution_review');
      await pool.query(`UPDATE jupeb_registrations SET nin_verification_id = $1 WHERE id = $2`,
        [verifyA.body.data.verification_id, id]);
      return { rows: [{ id }] };
    });
    const r1Id = r1.rows[0].id;

    // r2: in 'claimed' (cannot transition to approved) → expect rejected entry
    const r2Id = await createAtStatus(adminToken, fixtures, 'B', 'claimed');

    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1Id, r2Id], action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('approve');
    expect(res.body.data.accepted.find((a) => a.id === r1Id)).toBeDefined();
    expect(res.body.data.rejected.find((r) => r.id === r2Id)).toBeDefined();
    const r2Verdict = res.body.data.rejected.find((r) => r.id === r2Id);
    expect(r2Verdict.error_code).toBeDefined();
    expect(r2Verdict.message).toBeDefined();
  });

  it('batch reject with reason rejects all rows that allow the transition', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'BREJ');

    const r1 = await createAtStatus(adminToken, fixtures, 'R1', 'pending_institution_review');
    const r2 = await createAtStatus(adminToken, fixtures, 'R2', 'pending_institution_review');

    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1, r2], action: 'reject', reason: 'Incomplete documents (batch)' });
    expect(res.status).toBe(200);
    expect(res.body.data.accepted.map((a) => a.id).sort()).toEqual([r1, r2].sort());
    const after = await pool.query(`SELECT id, status FROM jupeb_registrations WHERE id = ANY($1::uuid[])`, [[r1, r2]]);
    expect(after.rows.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('batch withdraw moves rows to status=withdrawn, even from non-terminal pending states', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'BWDR');

    const r1 = await createAtStatus(adminToken, fixtures, 'W1', 'pending_documents');
    const r2 = await createAtStatus(adminToken, fixtures, 'W2', 'pending_institution_review');

    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [r1, r2], action: 'withdraw', reason: 'Candidate requested' });
    expect(res.status).toBe(200);
    expect(res.body.data.accepted.length).toBe(2);
    const after = await pool.query(`SELECT id, status FROM jupeb_registrations WHERE id = ANY($1::uuid[])`, [[r1, r2]]);
    expect(after.rows.every((r) => r.status === 'withdrawn')).toBe(true);
  });

  it('POST /institution/registrations/:id/withdraw works on a single row and is idempotent against re-call', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'WDR');
    const regId = await createAtStatus(adminToken, fixtures, 'W', 'claimed');

    const res = await request(app)
      .post(`/registration/institution/registrations/${regId}/withdraw`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Single-row withdraw' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('withdrawn');

    // Second call: terminal state — cannot re-withdraw → 422
    const again = await request(app)
      .post(`/registration/institution/registrations/${regId}/withdraw`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'again' });
    expect(again.status).toBe(422);
  });

  it('per-row withdraw 404 when registration does not exist', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const res = await request(app)
      .post('/registration/institution/registrations/aaaaaaaa-aaaa-1aaa-8aaa-aaaaaaaaaaaa/withdraw')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'x' });
    expect(res.status).toBe(404);
  });

  it('DELETE /institution/registrations/:id removes unclaimed code_issued row', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'RDEL');
    const regId = await createAtStatus(adminToken, fixtures, 'U1');

    const res = await request(app)
      .delete(`/registration/institution/registrations/${regId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    const gone = await pool.query(`SELECT 1 FROM jupeb_registrations WHERE id = $1`, [regId]);
    expect(gone.rowCount).toBe(0);
  });

  it('DELETE registration returns 422 for approved row', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'NDEL');
    const regId = await createAtStatus(adminToken, fixtures, 'Apr', 'approved');

    const res = await request(app)
      .delete(`/registration/institution/registrations/${regId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(422);
  });

  it('batch delete accepts deletable rows and rejects protected rows per id', async () => {
    if (!registrationMigrated) return;
    const adminToken = await getAdminToken();
    if (!adminToken) return;
    const fixtures = await makeFixtures(adminToken, 'BDEL');

    const okRejected = await createAtStatus(adminToken, fixtures, 'DRj', 'rejected');
    const okUnclaimed = await createAtStatus(adminToken, fixtures, 'DCd');
    const badApproved = await createAtStatus(adminToken, fixtures, 'DAp', 'approved');

    const res = await request(app)
      .post('/registration/institution/registrations/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ids: [okRejected, okUnclaimed, badApproved], action: 'delete' });
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('delete');
    const accIds = res.body.data.accepted.map((a) => a.id).sort();
    expect(accIds).toEqual([okRejected, okUnclaimed].sort());
    expect(res.body.data.accepted.every((a) => a.status === 'deleted')).toBe(true);
    const bad = res.body.data.rejected.find((r) => r.id === badApproved);
    expect(bad).toBeDefined();
    expect(bad.http_status).toBe(422);

    const still = await pool.query(`SELECT id FROM jupeb_registrations WHERE id = $1`, [badApproved]);
    expect(still.rowCount).toBe(1);
  });
});
