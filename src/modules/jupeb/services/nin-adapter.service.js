/**
 * Mock NIN provider for development/tests. Replace with real adapter (e.g. NIBSS) in production.
 * @param {string} normalizedNin 11 digits
 * @returns {Promise<{ ok: boolean, provider_reference?: string, profile?: object, error_code?: string, error_message?: string }>}
 */
async function verifyWithMock(normalizedNin) {
  if (normalizedNin.length !== 11) {
    return { ok: false, error_code: 'invalid_nin', error_message: 'NIN must be 11 digits' };
  }
  if (/^0+$/.test(normalizedNin)) {
    return { ok: false, error_code: 'invalid_nin', error_message: 'Invalid NIN' };
  }
  const ref = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    ok: true,
    provider_reference: ref,
    profile: {
      first_name: 'Mock',
      last_name: 'Candidate',
      middle_name: null,
      date_of_birth: '1990-01-01',
      gender: 'unspecified',
    },
  };
}

function getProvider() {
  return (process.env.JUPEB_NIN_PROVIDER || 'mock').toLowerCase();
}

async function verifyNin(normalizedNin) {
  const p = getProvider();
  if (p === 'mock' || process.env.NODE_ENV === 'test') {
    return verifyWithMock(normalizedNin);
  }
  return verifyWithMock(normalizedNin);
}

module.exports = {
  verifyNin,
  getProvider,
};
