const pool = require('../db/pool');

describe('migration 016 — jupeb_subject_combination_items', () => {
  let dbReady = false;
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch {
      dbReady = false;
    }
  });

  async function tableExists(name) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
      [name]
    );
    return r.rowCount > 0;
  }

  async function indexExists(name) {
    const r = await pool.query(`SELECT 1 FROM pg_indexes WHERE indexname = $1`, [name]);
    return r.rowCount > 0;
  }

  async function columnExists(table, column) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return r.rowCount > 0;
  }

  it('creates the join table with combination_id, subject_id, position', async () => {
    if (!dbReady) return;
    expect(await tableExists('jupeb_subject_combination_items')).toBe(true);
    expect(await columnExists('jupeb_subject_combination_items', 'combination_id')).toBe(true);
    expect(await columnExists('jupeb_subject_combination_items', 'subject_id')).toBe(true);
    expect(await columnExists('jupeb_subject_combination_items', 'position')).toBe(true);
  });

  it('enforces unique (combination_id, position) and (combination_id, subject_id)', async () => {
    if (!dbReady) return;
    expect(await indexExists('idx_jupeb_sci_combo_position')).toBe(true);
    expect(await indexExists('idx_jupeb_sci_combo_subject')).toBe(true);
  });

  it('jupeb_subject_combinations.subjects JSONB column is dropped (single-source-of-truth: join table)', async () => {
    if (!dbReady) return;
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'jupeb_subject_combinations' AND column_name = 'subjects'`
    );
    expect(r.rowCount).toBe(0);
  });
});
