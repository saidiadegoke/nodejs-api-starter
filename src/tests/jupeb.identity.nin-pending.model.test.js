const pool = require('../db/pool');
const ninVerificationModel = require('../modules/jupeb/models/nin-verification.model');
const { hashNin, ninLast4 } = require('../modules/jupeb/utils/identity-crypto');

describe('NinVerificationModel — pending lifecycle', () => {
  let migrated = false;
  const cleanupIds = [];

  beforeAll(async () => {
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_nin_verifications' AND column_name = 'intake_payload'`
      );
      migrated = r.rowCount > 0;
    } catch {
      migrated = false;
    }
    if (!migrated) {
      // eslint-disable-next-line no-console
      console.warn('[nin-pending.model] Skipping: apply migration 010 first.');
    }
  });

  afterAll(async () => {
    if (cleanupIds.length) {
      await pool.query('DELETE FROM jupeb_nin_verifications WHERE id = ANY($1::uuid[])', [cleanupIds]);
    }
  });

  function uniqueNin() {
    return `9${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  it('createPending writes a pending row with intake_payload, retry_after, attempt_count=1', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await ninVerificationModel.createPending({
      nin_hash: hashNin(nin),
      nin_last4: ninLast4(nin),
      provider: 'mock',
      idempotency_key: `idem-${nin}`,
      intake_payload: { name: 'Test One', email: 't1@example.com' },
      retry_after: new Date(Date.now() + 5000).toISOString(),
      last_error_code: 'provider_unavailable',
      requested_by: null,
    });
    cleanupIds.push(row.id);
    expect(row.status).toBe('pending');
    expect(row.attempt_count).toBe(1);
    expect(row.intake_payload).toMatchObject({ name: 'Test One', email: 't1@example.com' });
    expect(row.retry_after).not.toBeNull();
    expect(row.last_error_code).toBe('provider_unavailable');
    expect(row.verified_at).toBeNull();
  });

  it('markVerified flips a pending row to verified, sets verified_at, clears retry_after, increments attempt_count', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await ninVerificationModel.createPending({
      nin_hash: hashNin(nin),
      nin_last4: ninLast4(nin),
      provider: 'mock',
      intake_payload: {},
      retry_after: new Date(Date.now() + 1000).toISOString(),
      last_error_code: 'provider_unavailable',
      requested_by: null,
    });
    cleanupIds.push(row.id);

    const updated = await ninVerificationModel.markVerified(row.id, {
      response_payload: { first_name: 'A', last_name: 'B' },
      provider_reference: 'mock-ref-1',
    });
    expect(updated.status).toBe('verified');
    expect(updated.verified_at).not.toBeNull();
    expect(updated.retry_after).toBeNull();
    expect(updated.last_error_code).toBeNull();
    expect(updated.attempt_count).toBe(2);
    expect(updated.response_payload).toMatchObject({ first_name: 'A', last_name: 'B' });
    expect(updated.provider_reference).toBe('mock-ref-1');
  });

  it('markFailed flips pending to failed, clears retry_after, stores error_payload', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await ninVerificationModel.createPending({
      nin_hash: hashNin(nin),
      nin_last4: ninLast4(nin),
      provider: 'mock',
      intake_payload: {},
      retry_after: new Date(Date.now() + 1000).toISOString(),
      last_error_code: 'provider_unavailable',
      requested_by: null,
    });
    cleanupIds.push(row.id);

    const updated = await ninVerificationModel.markFailed(row.id, {
      error_payload: { code: 'provider_unavailable_giveup', message: 'gave up' },
      last_error_code: 'provider_unavailable_giveup',
    });
    expect(updated.status).toBe('failed');
    expect(updated.retry_after).toBeNull();
    expect(updated.error_payload).toMatchObject({ code: 'provider_unavailable_giveup' });
    expect(updated.last_error_code).toBe('provider_unavailable_giveup');
  });

  it('findDuePending returns only pending rows whose retry_after <= now', async () => {
    if (!migrated) return;
    const ninDue = uniqueNin();
    const ninNotDue = uniqueNin();
    const dueRow = await ninVerificationModel.createPending({
      nin_hash: hashNin(ninDue),
      nin_last4: ninLast4(ninDue),
      provider: 'mock',
      intake_payload: {},
      retry_after: new Date(Date.now() - 1000).toISOString(),
      last_error_code: 'provider_unavailable',
      requested_by: null,
    });
    cleanupIds.push(dueRow.id);
    const notDueRow = await ninVerificationModel.createPending({
      nin_hash: hashNin(ninNotDue),
      nin_last4: ninLast4(ninNotDue),
      provider: 'mock',
      intake_payload: {},
      retry_after: new Date(Date.now() + 60_000).toISOString(),
      last_error_code: 'provider_unavailable',
      requested_by: null,
    });
    cleanupIds.push(notDueRow.id);

    const due = await ninVerificationModel.findDuePending({ now: new Date(), limit: 50 });
    const ids = due.map((r) => r.id);
    expect(ids).toContain(dueRow.id);
    expect(ids).not.toContain(notDueRow.id);
  });
});
