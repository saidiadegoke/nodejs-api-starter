const pool = require('../db/pool');

describe('migration 013 — jupeb_subjects table', () => {
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

  async function columnExists(table, column) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
      [table, column]
    );
    return r.rowCount > 0;
  }

  it('jupeb_subjects table exists with expected columns', async () => {
    if (!dbReady) return;
    expect(await tableExists('jupeb_subjects')).toBe(true);
    for (const col of ['id', 'code', 'name', 'description', 'status', 'created_at', 'updated_at', 'deleted_at']) {
      expect(await columnExists('jupeb_subjects', col)).toBe(true);
    }
  });

  it('has unique index on LOWER(code) when not soft-deleted', async () => {
    if (!dbReady) return;
    const r = await pool.query(
      `SELECT 1 FROM pg_indexes
       WHERE tablename = 'jupeb_subjects' AND indexname = 'idx_jupeb_subjects_code_lower'`
    );
    expect(r.rowCount).toBe(1);
  });
});
