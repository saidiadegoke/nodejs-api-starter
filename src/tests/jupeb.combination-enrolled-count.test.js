const pool = require('../db/pool');
const subjectCombinationModel = require('../modules/jupeb/models/subject-combination.model');
const catalogService = require('../modules/jupeb/services/catalog.service');

describe('subject combination enrolled count by exact subjects', () => {
  let dbReady = false;
  const createdSubjectIds = [];
  const createdComboIds = [];
  const createdRegIds = [];

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  afterAll(async () => {
    if (!dbReady) return;
    if (createdRegIds.length) {
      await pool.query('DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])', [createdRegIds]);
    }
    if (createdComboIds.length) {
      await pool.query('DELETE FROM jupeb_subject_combination_items WHERE combination_id = ANY($1::uuid[])', [createdComboIds]);
      await pool.query('DELETE FROM jupeb_subject_combinations WHERE id = ANY($1::uuid[])', [createdComboIds]);
    }
    if (createdSubjectIds.length) {
      await pool.query('DELETE FROM jupeb_subjects WHERE id = ANY($1::uuid[])', [createdSubjectIds]);
    }
  });

  it('counts candidates offering the exact three subjects across combinations', async () => {
    if (!dbReady) return;

    const tag = `T${Date.now().toString(36).slice(-4)}`.toUpperCase();

    // 1. Create 4 subjects: S1, S2, S3, S4
    const s1 = await pool.query(`INSERT INTO jupeb_subjects (code, name) VALUES ($1, $2) RETURNING id`, [`S1${tag}`, `Subj1 ${tag}`]);
    const s2 = await pool.query(`INSERT INTO jupeb_subjects (code, name) VALUES ($1, $2) RETURNING id`, [`S2${tag}`, `Subj2 ${tag}`]);
    const s3 = await pool.query(`INSERT INTO jupeb_subjects (code, name) VALUES ($1, $2) RETURNING id`, [`S3${tag}`, `Subj3 ${tag}`]);
    const s4 = await pool.query(`INSERT INTO jupeb_subjects (code, name) VALUES ($1, $2) RETURNING id`, [`S4${tag}`, `Subj4 ${tag}`]);
    const id1 = s1.rows[0].id;
    const id2 = s2.rows[0].id;
    const id3 = s3.rows[0].id;
    const id4 = s4.rows[0].id;
    createdSubjectIds.push(id1, id2, id3, id4);

    // 2. Create comboA with subjects {id1, id2, id3}
    const cA = await pool.query(
      `INSERT INTO jupeb_subject_combinations (code, title, is_global) VALUES ($1, $2, true) RETURNING id`,
      [`CA-${tag}`, `Combo A ${tag}`]
    );
    const comboAId = cA.rows[0].id;
    createdComboIds.push(comboAId);
    await subjectCombinationModel.replaceItems(comboAId, [id1, id2, id3]);

    // 3. Create comboB with the EXACT same subjects {id1, id2, id3} (e.g. university-scoped or duplicate)
    const cB = await pool.query(
      `INSERT INTO jupeb_subject_combinations (code, title, is_global) VALUES ($1, $2, true) RETURNING id`,
      [`CB-${tag}`, `Combo B ${tag}`]
    );
    const comboBId = cB.rows[0].id;
    createdComboIds.push(comboBId);
    await subjectCombinationModel.replaceItems(comboBId, [id3, id1, id2]); // different insertion order

    // 4. Create comboC with different subjects {id1, id2, id4}
    const cC = await pool.query(
      `INSERT INTO jupeb_subject_combinations (code, title, is_global) VALUES ($1, $2, true) RETURNING id`,
      [`CC-${tag}`, `Combo C ${tag}`]
    );
    const comboCId = cC.rows[0].id;
    createdComboIds.push(comboCId);
    await subjectCombinationModel.replaceItems(comboCId, [id1, id2, id4]);

    // Get an existing session and university from DB to satisfy FK constraints for registration
    const sess = await pool.query(`SELECT id FROM jupeb_registration_sessions LIMIT 1`);
    const uni = await pool.query(`SELECT id FROM jupeb_universities LIMIT 1`);
    if (!sess.rows.length || !uni.rows.length) return;

    const sessionId = sess.rows[0].id;
    const universityId = uni.rows[0].id;

    // 5. Enroll 1 candidate in comboA (active/code_issued)
    const reg1 = await pool.query(
      `INSERT INTO jupeb_registrations (session_id, university_id, subject_combination_id, status)
       VALUES ($1, $2, $3, 'code_issued') RETURNING id`,
      [sessionId, universityId, comboAId]
    );
    createdRegIds.push(reg1.rows[0].id);

    // 6. Enroll 1 candidate in comboB (approved)
    const reg2 = await pool.query(
      `INSERT INTO jupeb_registrations (session_id, university_id, subject_combination_id, status)
       VALUES ($1, $2, $3, 'approved') RETURNING id`,
      [sessionId, universityId, comboBId]
    );
    createdRegIds.push(reg2.rows[0].id);

    // 7. Enroll 1 candidate in comboA who is withdrawn (should NOT be counted)
    const reg3 = await pool.query(
      `INSERT INTO jupeb_registrations (session_id, university_id, subject_combination_id, status)
       VALUES ($1, $2, $3, 'withdrawn') RETURNING id`,
      [sessionId, universityId, comboAId]
    );
    createdRegIds.push(reg3.rows[0].id);

    // Test enrolledCountsForCombinations directly
    const countsMap = await subjectCombinationModel.enrolledCountsForCombinations([
      comboAId,
      comboBId,
      comboCId,
    ]);

    // Both comboA and comboB offer {id1, id2, id3}. Candidates offering this exact 3-subject combination = 2
    expect(countsMap.get(comboAId)).toBe(2);
    expect(countsMap.get(comboBId)).toBe(2);
    // comboC offers {id1, id2, id4}, which has 0 enrolled candidates
    expect(countsMap.get(comboCId)).toBe(0);

    // Test via catalogService._embedSubjectItemsBatch
    const enriched = await catalogService._embedSubjectItemsBatch(
      [
        { id: comboAId, code: `CA-${tag}` },
        { id: comboBId, code: `CB-${tag}` },
        { id: comboCId, code: `CC-${tag}` },
      ],
      { withEnrolled: true }
    );

    expect(enriched.find((c) => c.id === comboAId).enrolled_count).toBe(2);
    expect(enriched.find((c) => c.id === comboBId).enrolled_count).toBe(2);
    expect(enriched.find((c) => c.id === comboCId).enrolled_count).toBe(0);
  });
});
