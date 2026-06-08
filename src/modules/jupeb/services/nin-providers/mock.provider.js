const name = 'mock';

/**
 * When `JUPEB_NIN_MOCK_STRICT=1` (or `true`), only the ten NINs documented for
 * SpeedySMS's free test pool verify — same as passing `provider: 'mock'` on
 * their live API (`00000000001` … `00000000010`). Any other 11-digit value
 * returns `outcome: 'failed'` so local/staging behaves closer to production.
 *
 * Default (strict off): any 11-digit NIN except all zeros succeeds — that is
 * intentional for dev/tests and is **not** a national-database check.
 */
function isMockStrict() {
  const v = process.env.JUPEB_NIN_MOCK_STRICT;
  return v === '1' || String(v).toLowerCase() === 'true';
}

/** Same pattern SpeedySMS uses for their mock/test NIN pool. */
const MOCK_TEST_POOL_RE = /^000000000(0[1-9]|10)$/;

// Derive a per-NIN profile so different NINs map to different identifying
// fields. Real upstream providers return distinct data for each NIN; using
// a static fixture means downstream flows (e.g. completeRegistration, which
// pulls phone from the NIN response and INSERTs into users.phone with a
// unique constraint) collide every time. The values aren't meaningful —
// they just need to be deterministic per NIN and globally unique.
function mockProfileFor(nin) {
  const last4 = nin.slice(-4);
  const last8 = nin.slice(-8);
  const phone = `+2348${last8}`;
  return {
    first_name: `Mock${last4}`,
    last_name: 'Candidate',
    middle_name: 'Sample',
    title: 'MR',
    date_of_birth: '1990-01-01',
    gender: 'male',
    height: null,
    marital_status: 'SINGLE',
    religion: null,
    profession: 'STUDENT',
    education_level: null,
    employment_status: null,
    spoken_language: null,
    email: null,
    phone_number: phone,
    phone,
    address: `${last4} Main Street, Lagos, Nigeria`,
    state_of_origin: 'Ondo State',
    lga: 'Ondo West',
    place_of_birth: 'Lagos State',
    birthplace: { country: 'nigeria', state: 'Ondo State', lga: 'Ondo West' },
    residence: {
      address: `${last4} Main Street`,
      town: 'Akure',
      lga: 'Ondo West',
      state: 'Ondo',
      status: null,
    },
    next_of_kin: {
      name: `Jane ${last4}`,
      relationship: 'mother',
      contact: `+2347${last8}`,
    },
    next_of_kin_record: {
      first_name: 'Jane',
      middle_name: null,
      last_name: last4,
      address1: null,
      address2: null,
      town: null,
      lga: null,
      state: null,
      postal_code: null,
    },
    tracking_id: null,
    photo_url: `https://example.invalid/jupeb-mock-nin-photos/${last4}.jpg`,
    signature_url: null,
    provider_lookup: {
      lookup_id: `mock-lookup-${nin.slice(-6)}`,
      nin_last_4: last4,
      from_cache: false,
      cached_at: null,
      original_lookup_id: null,
      billed: null,
      error_message: null,
    },
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
  if (isMockStrict() && !MOCK_TEST_POOL_RE.test(normalizedNin)) {
    return {
      outcome: 'failed',
      error_code: 'nin_not_in_mock_test_pool',
      error_message:
        'Mock NIN provider is in strict mode (JUPEB_NIN_MOCK_STRICT=1): only NINs 00000000001 through 00000000010 return verified. Unset JUPEB_NIN_MOCK_STRICT for permissive dev mock, or set JUPEB_NIN_PROVIDER=speedysms for real NIMC-backed lookups.',
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
