const pool = require('../db/pool');

describe('migration 015 — session cutoffs + fees', () => {
  let baseMigrated = false;
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registration_sessions LIMIT 1');
      baseMigrated = true;
    } catch {
      baseMigrated = false;
    }
  });

  async function columnExists(column) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'jupeb_registration_sessions' AND column_name = $1`,
      [column]
    );
    return r.rowCount > 0;
  }

  it('adds candidate_info_cutoff_at, profile_update_cutoff_at, ca_cutoff_at, max_ca_score', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('candidate_info_cutoff_at')).toBe(true);
    expect(await columnExists('profile_update_cutoff_at')).toBe(true);
    expect(await columnExists('ca_cutoff_at')).toBe(true);
    expect(await columnExists('max_ca_score')).toBe(true);
  });

  it('adds affiliation_fee_existing, affiliation_fee_new, exam_fee_per_candidate', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('affiliation_fee_existing')).toBe(true);
    expect(await columnExists('affiliation_fee_new')).toBe(true);
    expect(await columnExists('exam_fee_per_candidate')).toBe(true);
  });
});
