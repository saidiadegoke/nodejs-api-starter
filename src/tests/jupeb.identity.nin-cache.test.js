const pool = require('../db/pool');
const ninVerificationModel = require('../modules/jupeb/models/nin-verification.model');
const { hashNin, ninLast4 } = require('../modules/jupeb/utils/identity-crypto');

describe('NinVerificationModel — cache lifecycle (findActiveCacheByNinHash / clearById)', () => {
  let migrated = false;
  const cleanupIds = [];

  beforeAll(async () => {
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_nin_verifications' AND column_name = 'cleared_at'`
      );
      migrated = r.rowCount > 0;
    } catch {
      migrated = false;
    }
    if (!migrated) {
      // eslint-disable-next-line no-console
      console.warn('[nin-cache.model] Skipping: apply migration 008 first.');
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

  async function seedVerified(nin, overrides = {}) {
    const row = await ninVerificationModel.create({
      nin_hash: hashNin(nin),
      nin_last4: ninLast4(nin),
      provider: 'mock',
      provider_reference: `ref-${Math.random().toString(36).slice(2, 8)}`,
      idempotency_key: null,
      status: 'verified',
      response_payload: { first_name: 'Wigo', last_name: 'Musa' },
      error_payload: {},
      verified_at: new Date().toISOString(),
      requested_by: null,
      ...overrides,
    });
    cleanupIds.push(row.id);
    return row;
  }

  it('findActiveCacheByNinHash returns the latest verified, non-cleared row for the nin_hash', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await seedVerified(nin);
    const hit = await ninVerificationModel.findActiveCacheByNinHash(hashNin(nin));
    expect(hit).not.toBeNull();
    expect(hit.id).toBe(row.id);
    expect(hit.response_payload).toMatchObject({ first_name: 'Wigo', last_name: 'Musa' });
    expect(hit.cleared_at).toBeNull();
  });

  it('clearById purges response_payload and stamps cleared_at', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await seedVerified(nin);
    const cleared = await ninVerificationModel.clearById(row.id);
    expect(cleared.cleared_at).not.toBeNull();
    expect(cleared.response_payload).toEqual({});
  });

  it('findActiveCacheByNinHash skips rows that have been cleared', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await seedVerified(nin);
    await ninVerificationModel.clearById(row.id);
    const hit = await ninVerificationModel.findActiveCacheByNinHash(hashNin(nin));
    expect(hit).toBeNull();
  });

  it('clearById is idempotent — a second call on an already-cleared row returns null', async () => {
    if (!migrated) return;
    const nin = uniqueNin();
    const row = await seedVerified(nin);
    const first = await ninVerificationModel.clearById(row.id);
    expect(first).not.toBeNull();
    const second = await ninVerificationModel.clearById(row.id);
    expect(second).toBeNull();
  });

  it('returns null when no row exists for the nin_hash', async () => {
    if (!migrated) return;
    const hit = await ninVerificationModel.findActiveCacheByNinHash(hashNin(uniqueNin()));
    expect(hit).toBeNull();
  });
});

describe('IdentityService.verifyNin — cache reuse', () => {
  const ninAdapter = require('../modules/jupeb/services/nin-adapter.service');
  const IdentityService = require('../modules/jupeb/services/identity.service');

  let migrated = false;
  const cleanupIds = [];

  beforeAll(async () => {
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_nin_verifications' AND column_name = 'cleared_at'`
      );
      migrated = r.rowCount > 0;
    } catch {
      migrated = false;
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

  it('a second verifyNin for the same NIN reuses the cached row instead of calling the provider', async () => {
    if (!migrated) return;
    const nin = uniqueNin();

    // First call — populates the cache.
    const first = await IdentityService.verifyNin({ nin, provider: 'mock' }, null);
    cleanupIds.push(first.verification_id);
    expect(first.status).toBe('verified');

    // Spy on the adapter so we can prove the second call doesn't hit it.
    const spy = jest.spyOn(ninAdapter, 'verifyNin');
    try {
      const second = await IdentityService.verifyNin({ nin, provider: 'mock' }, null);
      expect(second.verification_id).toBe(first.verification_id);
      expect(second.status).toBe('verified');
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('after the cached row is cleared, verifyNin calls the provider again and creates a new row', async () => {
    if (!migrated) return;
    const nin = uniqueNin();

    const first = await IdentityService.verifyNin({ nin, provider: 'mock' }, null);
    cleanupIds.push(first.verification_id);

    // Simulate the registration reaching a terminal status.
    await ninVerificationModel.clearById(first.verification_id);

    const second = await IdentityService.verifyNin({ nin, provider: 'mock' }, null);
    cleanupIds.push(second.verification_id);
    expect(second.verification_id).not.toBe(first.verification_id);
    expect(second.status).toBe('verified');
  });
});
