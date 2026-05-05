const DEFAULT_RETRY_SECONDS = 300;

const MOCK_PROFILE = {
  first_name: 'Mock',
  last_name: 'Candidate',
  middle_name: null,
  date_of_birth: '1990-01-01',
  gender: 'unspecified',
  address: '123 Main Street, Lagos, Nigeria',
  state_of_origin: 'Ondo State',
  lga: 'Ondo West',
  place_of_birth: 'Lagos State',
  phone: '+234 801 234 5678',
  next_of_kin: {
    name: 'Jane Johnson',
    relationship: 'Mother',
    contact: '+234 802 345 6789',
  },
  photo_url: null,
};

function mockOutcome(normalizedNin) {
  if (normalizedNin.length !== 11) {
    return {
      outcome: 'failed',
      error_code: 'invalid_nin',
      error_message: 'NIN must be 11 digits',
    };
  }
  if (/^0+$/.test(normalizedNin)) {
    return {
      outcome: 'failed',
      error_code: 'invalid_nin',
      error_message: 'Invalid NIN',
    };
  }
  const ref = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    outcome: 'verified',
    provider_reference: ref,
    profile: { ...MOCK_PROFILE },
  };
}

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
  return (process.env.JUPEB_NIN_PROVIDER || 'mock').toLowerCase();
}

/**
 * Verify a normalized 11-digit NIN.
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
  const result = mockOutcome(normalizedNin);
  return { ...result, ok: result.outcome === 'verified' };
}

module.exports = {
  verifyNin,
  getProvider,
};
