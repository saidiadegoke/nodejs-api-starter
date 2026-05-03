const pool = require('../db/pool');
const ninVerificationModel = require('../modules/jupeb/models/nin-verification.model');
const { hashNin, ninLast4 } = require('../modules/jupeb/utils/identity-crypto');

describe('NIN resolver job', () => {
  let migrated = false;
  const cleanupIds = [];
  let resolver;
  let nextRetryAfter;

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
    if (!migrated) return;
    // require lazily so the module isn't loaded if migration is missing
    // eslint-disable-next-line global-require
    resolver = require('../modules/jupeb/jobs/nin-resolver.job');
    nextRetryAfter = resolver.nextRetryAfter;
  });

  afterEach(() => {
    delete process.env.JUPEB_NIN_FORCE_UNAVAILABLE;
  });

  afterAll(async () => {
    if (cleanupIds.length) {
      await pool.query('DELETE FROM jupeb_nin_verifications WHERE id = ANY($1::uuid[])', [cleanupIds]);
    }
  });

  function uniqueNin() {
    return `9${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  async function seedPending({ retry_after, attempt_count = 1 } = {}) {
    const nin = uniqueNin();
    const row = await ninVerificationModel.createPending({
      nin_hash: hashNin(nin),
      nin_last4: ninLast4(nin),
      provider: 'mock',
      idempotency_key: `idem-resolver-${nin}-${Date.now()}-${Math.random()}`,
      intake_payload: {},
      retry_after: retry_after || new Date(Date.now() - 1000).toISOString(),
      last_error_code: 'provider_unavailable',
      requested_by: null,
    });
    if (attempt_count > 1) {
      await pool.query(
        `UPDATE jupeb_nin_verifications SET attempt_count = $2 WHERE id = $1`,
        [row.id, attempt_count]
      );
    }
    cleanupIds.push(row.id);
    return row;
  }

  describe('nextRetryAfter (pure)', () => {
    it('returns increasing intervals for higher attempt counts', () => {
      if (!migrated) return;
      const t0 = Date.now();
      const a1 = nextRetryAfter(1, t0);
      const a3 = nextRetryAfter(3, t0);
      const a5 = nextRetryAfter(5, t0);
      expect(new Date(a3).getTime()).toBeGreaterThan(new Date(a1).getTime());
      expect(new Date(a5).getTime()).toBeGreaterThan(new Date(a3).getTime());
    });

    it('caps at 24h', () => {
      if (!migrated) return;
      const t0 = Date.now();
      const big = nextRetryAfter(100, t0);
      const cap = t0 + 24 * 3600 * 1000;
      expect(new Date(big).getTime()).toBeLessThanOrEqual(cap + 1000);
    });
  });

  describe('resolvePendingOnce', () => {
    it('flips a due pending row to verified when adapter returns verified', async () => {
      if (!migrated) return;
      const due = await seedPending({ retry_after: new Date(Date.now() - 5000).toISOString() });
      const notDue = await seedPending({ retry_after: new Date(Date.now() + 60_000).toISOString() });

      const stats = await resolver.resolvePendingOnce({ now: new Date(), limit: 50 });
      expect(stats.verified).toBeGreaterThanOrEqual(1);

      const dueRow = await ninVerificationModel.findById(due.id);
      const notDueRow = await ninVerificationModel.findById(notDue.id);
      expect(dueRow.status).toBe('verified');
      expect(notDueRow.status).toBe('pending');
    });

    it('increments attempt_count and pushes retry_after when adapter is still unavailable', async () => {
      if (!migrated) return;
      process.env.JUPEB_NIN_FORCE_UNAVAILABLE = '1';
      const due = await seedPending({ retry_after: new Date(Date.now() - 5000).toISOString() });
      const before = due.attempt_count;
      await resolver.resolvePendingOnce({ now: new Date(), limit: 50 });
      const after = await ninVerificationModel.findById(due.id);
      expect(after.status).toBe('pending');
      expect(after.attempt_count).toBe(before + 1);
      // Compare relatively — schema uses TIMESTAMP WITHOUT TIME ZONE which read-back drifts by TZ offset.
      expect(new Date(after.retry_after).getTime()).toBeGreaterThan(new Date(due.retry_after).getTime());
    });

    it('flips to failed when give-up threshold exceeded', async () => {
      if (!migrated) return;
      process.env.JUPEB_NIN_FORCE_UNAVAILABLE = '1';
      process.env.JUPEB_NIN_MAX_ATTEMPTS = '3';
      const due = await seedPending({
        retry_after: new Date(Date.now() - 5000).toISOString(),
        attempt_count: 3,
      });
      await resolver.resolvePendingOnce({ now: new Date(), limit: 50 });
      const after = await ninVerificationModel.findById(due.id);
      expect(after.status).toBe('failed');
      expect(after.last_error_code).toBe('provider_unavailable_giveup');
      delete process.env.JUPEB_NIN_MAX_ATTEMPTS;
    });
  });
});
