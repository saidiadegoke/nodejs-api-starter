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

const name = 'mock';

async function verifyNin(normalizedNin) {
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

module.exports = { name, verifyNin };
