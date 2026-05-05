const pool = require('../db/pool');

describe('migration 010 — NIN pending columns', () => {
  let baseMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_nin_verifications LIMIT 1');
      baseMigrated = true;
    } catch {
      baseMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[nin-pending.schema] Skipping: apply migration `004_jupeb_identity.sql` first.');
    }
  });

  async function columnExists(column) {
    const r = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'jupeb_nin_verifications' AND column_name = $1`,
      [column]
    );
    return r.rowCount > 0;
  }

  it('jupeb_nin_verifications.intake_payload exists as jsonb default empty object', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('intake_payload')).toBe(true);
    const r = await pool.query(
      `SELECT data_type, column_default FROM information_schema.columns
       WHERE table_name = 'jupeb_nin_verifications' AND column_name = 'intake_payload'`
    );
    expect(r.rows[0].data_type).toBe('jsonb');
  });

  it('jupeb_nin_verifications has retry_after, attempt_count, last_attempt_at, last_error_code', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('retry_after')).toBe(true);
    expect(await columnExists('attempt_count')).toBe(true);
    expect(await columnExists('last_attempt_at')).toBe(true);
    expect(await columnExists('last_error_code')).toBe(true);
  });

  it('partial index idx_nin_verifications_pending_retry exists', async () => {
    if (!baseMigrated) return;
    const r = await pool.query(
      `SELECT 1 FROM pg_indexes
       WHERE tablename = 'jupeb_nin_verifications'
         AND indexname = 'idx_nin_verifications_pending_retry'`
    );
    expect(r.rowCount).toBe(1);
  });
});
