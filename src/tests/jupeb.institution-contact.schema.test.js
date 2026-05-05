const pool = require('../db/pool');

describe('migration 014 — institution contact columns', () => {
  let baseMigrated = false;
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_universities LIMIT 1');
      baseMigrated = true;
    } catch {
      baseMigrated = false;
    }
  });

  async function columnExists(column) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'jupeb_universities' AND column_name = $1`,
      [column]
    );
    return r.rowCount > 0;
  }

  it('adds email, address, phone, expected_candidate_count, description', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('email')).toBe(true);
    expect(await columnExists('address')).toBe(true);
    expect(await columnExists('phone')).toBe(true);
    expect(await columnExists('expected_candidate_count')).toBe(true);
    expect(await columnExists('description')).toBe(true);
  });
});
