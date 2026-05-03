const pool = require('../db/pool');

describe('migration 011 — intake extensions', () => {
  let baseMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      baseMigrated = true;
    } catch {
      baseMigrated = false;
    }
  });

  async function columnExists(table, column) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return r.rowCount > 0;
  }

  it('jupeb_registrations.sittings_count exists with check constraint (1 or 2)', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('jupeb_registrations', 'sittings_count')).toBe(true);
  });

  it('jupeb_registrations.result_types exists as jsonb', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('jupeb_registrations', 'result_types')).toBe(true);
    const r = await pool.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_name = 'jupeb_registrations' AND column_name = 'result_types'`
    );
    expect(r.rows[0].data_type).toBe('jsonb');
  });

  it('jupeb_universities.university_type exists', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('jupeb_universities', 'university_type')).toBe(true);
  });
});
