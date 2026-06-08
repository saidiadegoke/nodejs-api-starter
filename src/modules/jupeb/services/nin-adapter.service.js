// NIN verification routing:
// - Request body `provider: 'mock'` → in-process mock (no network, synthetic profile).
// - Otherwise → SpeedySMS (`speedysms.provider`) — real NIMC-backed lookups when
//   `SPEEDYSMS_API_KEY` is set; otherwise `outcome: unavailable` (misconfigured).
//
// `JUPEB_NIN_FORCE_UNAVAILABLE=1` short-circuits to `unavailable` for any path — used by tests.

const registry = require('./nin-providers');

const DEFAULT_RETRY_SECONDS = 300;

function unavailable() {
  const seconds = Number(process.env.JUPEB_NIN_RETRY_AFTER_SECONDS) || DEFAULT_RETRY_SECONDS;
  return {
    outcome: 'unavailable',
    error_code: 'provider_unavailable',
    error_message: 'NIN provider is temporarily unavailable',
    retry_after_seconds: seconds,
  };
}

/** Label stored on `jupeb_nin_verifications.provider` for the default (non-mock) HTTP path. */
function getProvider() {
  return 'speedysms';
}

function useInProcessMock(opts) {
  return String(opts && opts.provider).toLowerCase() === 'mock';
}

/**
 * Verify a normalized 11-digit NIN.
 *
 * @param {string} normalizedNin
 * @param {{ provider?: string, force_fresh?: boolean, http?: import('axios').AxiosInstance }} [opts]
 * @returns {Promise<{
 *   outcome: 'verified' | 'failed' | 'unavailable',
 *   ok: boolean,
 *   provider_reference?: string,
 *   profile?: object,
 *   error_code?: string,
 *   error_message?: string,
 *   retry_after_seconds?: number,
 * }>}
 */
async function verifyNin(normalizedNin, opts = {}) {
  if (process.env.JUPEB_NIN_FORCE_UNAVAILABLE === '1') {
    const u = unavailable();
    // Lets IdentityService persist `provider: mock` on pending rows so retry/resolver
    // re-runs through the in-process mock (no SpeedySMS key required in tests).
    return { ...u, ok: false, simulated_outage: true };
  }
  if (useInProcessMock(opts)) {
    const mockProvider = registry.get('mock');
    const result = await mockProvider.verifyNin(normalizedNin, opts);
    return { ...result, ok: result.outcome === 'verified' };
  }
  const speedysms = registry.get('speedysms');
  // Forward SpeedySMS gateway options only (`force_fresh`, upstream `provider` like `mono`);
  // our in-process `mock` is selected only via the branch above.
  const forward = {};
  if (opts.force_fresh) forward.force_fresh = opts.force_fresh;
  if (opts.http) forward.http = opts.http;
  if (opts.provider && String(opts.provider).toLowerCase() !== 'mock') {
    forward.provider = opts.provider;
  }
  const result = await speedysms.verifyNin(normalizedNin, forward);
  return { ...result, ok: result.outcome === 'verified' };
}

/** Build adapter opts when re-verifying from a persisted `jupeb_nin_verifications.provider` value. */
function verifyOptsFromStoredProvider(providerName) {
  return String(providerName || '').toLowerCase() === 'mock' ? { provider: 'mock' } : {};
}

module.exports = {
  verifyNin,
  getProvider,
  listProviders: registry.list,
  verifyOptsFromStoredProvider,
};
