const name = 'mock';

// Derive a per-NIN profile so different NINs map to different identifying
// fields. Real upstream providers return distinct data for each NIN; using
// a static fixture means downstream flows (e.g. registerWithCode, which
// pulls phone from the NIN response and INSERTs into users.phone with a
// unique constraint) collide every time. The values aren't meaningful —
// they just need to be deterministic per NIN and globally unique.
function mockProfileFor(nin) {
  const last4 = nin.slice(-4);
  const last8 = nin.slice(-8);
  return {
    first_name: `Mock${last4}`,
    last_name: 'Candidate',
    middle_name: null,
    date_of_birth: '1990-01-01',
    gender: 'unspecified',
    address: `${last4} Main Street, Lagos, Nigeria`,
    state_of_origin: 'Ondo State',
    lga: 'Ondo West',
    place_of_birth: 'Lagos State',
    phone: `+2348${last8}`,
    next_of_kin: {
      name: `Jane ${last4}`,
      relationship: 'Mother',
      contact: `+2347${last8}`,
    },
    photo_url: null,
  };
}

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
    profile: mockProfileFor(normalizedNin),
  };
}

module.exports = { name, verifyNin };
