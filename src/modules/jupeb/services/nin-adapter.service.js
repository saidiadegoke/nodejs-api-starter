// Thin facade over the NIN provider registry. The active provider is chosen
// by JUPEB_NIN_PROVIDER (default: 'mock'). JUPEB_NIN_FORCE_UNAVAILABLE=1
// short-circuits to an `unavailable` outcome regardless of provider — used
// by tests to exercise the resolver's retry/back-off paths.

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

function getProvider() {
  return registry.resolveName();
}

/**
 * Verify a normalized 11-digit NIN through the currently selected provider.
 *
 * Returns an outcome of `verified`, `failed` (provider rejected the NIN — terminal),
 * or `unavailable` (we could not reach the provider — should be retried).
 *
 * Includes legacy `ok` field during migration for callers not yet on the new contract.
 *
 * @param {string} normalizedNin
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
async function verifyNin(normalizedNin) {
  if (process.env.JUPEB_NIN_FORCE_UNAVAILABLE === '1') {
    const u = unavailable();
    return { ...u, ok: false };
  }
  const provider = registry.get(getProvider());
  const result = await provider.verifyNin(normalizedNin);
  return { ...result, ok: result.outcome === 'verified' };
}

module.exports = {
  verifyNin,
  getProvider,
  listProviders: registry.list,
};
