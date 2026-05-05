const pool = require('../db/pool');

describe('migration 012 — biometric skip schema', () => {
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

  it('jupeb_registrations.fingerprint_skipped_at exists', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('jupeb_registrations', 'fingerprint_skipped_at')).toBe(true);
  });

  it('jupeb_registrations.face_skipped_at exists', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('jupeb_registrations', 'face_skipped_at')).toBe(true);
  });

  it('jupeb_biometric_captures.replaced_at exists', async () => {
    if (!baseMigrated) return;
    expect(await columnExists('jupeb_biometric_captures', 'replaced_at')).toBe(true);
  });
});
