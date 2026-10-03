const registry = require('../modules/jupeb/services/nin-providers');
const mock = require('../modules/jupeb/services/nin-providers/mock.provider');
const speedysms = require('../modules/jupeb/services/nin-providers/speedysms.provider');
const ninAdapter = require('../modules/jupeb/services/nin-adapter.service');

function makeHttpMock(response) {
  return { post: jest.fn().mockResolvedValue(response) };
}

function makeHttpReject(err) {
  return { post: jest.fn().mockRejectedValue(err) };
}

const SUCCESS_BODY = {
  status: 'success',
  lookup_id: 'lookup-abc',
  nin_last_4: '8901',
  data: {
    first_name: 'WIGO',
    middle_name: 'SAMUEL',
    last_name: 'MUSA',
    date_of_birth: '1990-01-01',
    gender: 'male',
    phone_number: '08012345678',
    birthplace: { country: 'nigeria', state: 'Lagos', lga: 'Lagos Mainland' },
    residence: {
      address: '2A MUSA ADE STREET',
      town: 'OGBA',
      lga: 'Ogba',
      state: 'Lagos',
      status: 'birth',
    },
    next_of_kin: { first_name: 'AISHA', middle_name: '', last_name: 'AGBA' },
  },
  photo_url: 'https://s3.example/sig/photo.jpg?sig=…',
  signature_url: 'https://s3.example/sig/signature.jpg?sig=…',
  from_cache: false,
  error_message: null,
};

describe('nin-providers registry', () => {
  it('lists registered providers', () => {
    const names = registry.list();
    expect(names).toEqual(expect.arrayContaining(['mock', 'speedysms']));
  });

  it('defaults to speedysms when JUPEB_NIN_PROVIDER is unset', () => {
    const prior = process.env.JUPEB_NIN_PROVIDER;
    delete process.env.JUPEB_NIN_PROVIDER;
    delete process.env.NIN_PROVIDER;
    expect(registry.resolveName()).toBe('speedysms');
    if (prior !== undefined) process.env.JUPEB_NIN_PROVIDER = prior;
  });

  it('falls back to speedysms when JUPEB_NIN_PROVIDER names an unknown provider', () => {
    const prior = process.env.JUPEB_NIN_PROVIDER;
    process.env.JUPEB_NIN_PROVIDER = 'does-not-exist';
    expect(registry.resolveName()).toBe('speedysms');
    if (prior === undefined) delete process.env.JUPEB_NIN_PROVIDER;
    else process.env.JUPEB_NIN_PROVIDER = prior;
  });

  it('selects speedysms when JUPEB_NIN_PROVIDER=speedysms', () => {
    const prior = process.env.JUPEB_NIN_PROVIDER;
    process.env.JUPEB_NIN_PROVIDER = 'speedysms';
    expect(registry.resolveName()).toBe('speedysms');
    expect(ninAdapter.getProvider()).toBe('speedysms');
    if (prior === undefined) delete process.env.JUPEB_NIN_PROVIDER;
    else process.env.JUPEB_NIN_PROVIDER = prior;
  });
});

describe('mock NIN provider', () => {
  const ORIG_STRICT = process.env.JUPEB_NIN_MOCK_STRICT;

  afterEach(() => {
    if (ORIG_STRICT === undefined) delete process.env.JUPEB_NIN_MOCK_STRICT;
    else process.env.JUPEB_NIN_MOCK_STRICT = ORIG_STRICT;
  });

  it('verifies any 11-digit NIN when strict mode is off (dev default)', async () => {
    delete process.env.JUPEB_NIN_MOCK_STRICT;
    const r = await mock.verifyNin('99988877766');
    expect(r.outcome).toBe('verified');
    expect(r.profile.first_name).toBe('Mock7766');
  });

  it('in strict mode only accepts 00000000001–00000000010', async () => {
    process.env.JUPEB_NIN_MOCK_STRICT = '1';
    const bad = await mock.verifyNin('99988877766');
    expect(bad.outcome).toBe('failed');
    expect(bad.error_code).toBe('nin_not_in_mock_test_pool');

    const ok = await mock.verifyNin('00000000005');
    expect(ok.outcome).toBe('verified');
    expect(ok.profile.first_name).toBe('Mock0005');
  });
});

describe('speedysms NIN provider', () => {
  const ORIGINAL_KEY = process.env.SPEEDYSMS_API_KEY;
  const ORIGINAL_BASE = process.env.SPEEDYSMS_API_BASE_URL;

  beforeEach(() => {
    process.env.SPEEDYSMS_API_KEY = 'sk_test_key';
    process.env.SPEEDYSMS_API_BASE_URL = 'https://api.speedysms.com.ng';
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.SPEEDYSMS_API_KEY;
    else process.env.SPEEDYSMS_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_BASE === undefined) delete process.env.SPEEDYSMS_API_BASE_URL;
    else process.env.SPEEDYSMS_API_BASE_URL = ORIGINAL_BASE;
  });

  it('rejects malformed NIN locally without calling the upstream', async () => {
    const http = makeHttpMock({ status: 200, data: {} });
    const r = await speedysms.verifyNin('123', { http });
    expect(r.outcome).toBe('failed');
    expect(r.error_code).toBe('invalid_nin');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('returns outcome=unavailable when the API key is missing (without calling upstream)', async () => {
    delete process.env.SPEEDYSMS_API_KEY;
    const http = makeHttpMock({ status: 200, data: SUCCESS_BODY });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('provider_misconfigured');
    expect(http.post).not.toHaveBeenCalled();
  });

  it('maps a SpeedySMS success body to a verified profile', async () => {
    const http = makeHttpMock({ status: 200, data: SUCCESS_BODY });
    const r = await speedysms.verifyNin('12345678901', { http });

    expect(http.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = http.post.mock.calls[0];
    expect(url).toBe('https://api.speedysms.com.ng/identity/nin');
    expect(body).toEqual({ nin: '12345678901' });  // no provider / force_fresh sent by default
    expect(opts.headers.Authorization).toBe('Bearer sk_test_key');

    expect(r.outcome).toBe('verified');
    expect(r.provider_reference).toBe('lookup-abc');
    expect(r.profile.first_name).toBe('WIGO');
    expect(r.profile.last_name).toBe('MUSA');
    expect(r.profile.middle_name).toBe('SAMUEL');
    expect(r.profile.date_of_birth).toBe('1990-01-01');
    expect(r.profile.gender).toBe('male');
    expect(r.profile.phone).toBe('08012345678');
    expect(r.profile.state_of_origin).toBe('Lagos');
    expect(r.profile.lga).toBe('Lagos Mainland');
    expect(r.profile.place_of_birth).toBe('Lagos Mainland, Lagos, nigeria');
    expect(r.profile.address).toBe('2A MUSA ADE STREET, OGBA, Ogba, Lagos');
    expect(r.profile.next_of_kin.name).toBe('AISHA AGBA');
    expect(r.profile.next_of_kin.relationship).toBeNull();
    expect(r.profile.next_of_kin.contact).toBeNull();
    expect(r.profile.photo_url).toBe('https://s3.example/sig/photo.jpg?sig=…');
    expect(r.profile.birthplace).toMatchObject({ country: 'nigeria', state: 'Lagos', lga: 'Lagos Mainland' });
    expect(r.profile.residence).toMatchObject({
      address: '2A MUSA ADE STREET',
      town: 'OGBA',
      lga: 'Ogba',
      state: 'Lagos',
      status: 'birth',
    });
    expect(r.profile.provider_lookup).toMatchObject({
      lookup_id: 'lookup-abc',
      nin_last_4: '8901',
    });
  });

  it('maps status=not_found to outcome=failed (terminal)', async () => {
    const http = makeHttpMock({
      status: 200,
      data: { status: 'not_found', error_message: 'No record found' },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('failed');
    expect(r.error_code).toBe('not_found');
    expect(r.error_message).toBe('No record found');
  });

  it('maps status=invalid to outcome=failed (terminal)', async () => {
    const http = makeHttpMock({
      status: 400,
      data: { status: 'invalid', error_message: 'Invalid NIN format' },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('failed');
    expect(r.error_code).toBe('invalid');
  });

  it('maps status=provider_unavailable to outcome=unavailable with retry_after_seconds', async () => {
    const http = makeHttpMock({
      status: 200,
      data: { status: 'provider_unavailable', error_message: 'Mono down' },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('provider_unavailable');
    expect(typeof r.retry_after_seconds).toBe('number');
    expect(r.retry_after_seconds).toBeGreaterThan(0);
  });

  it('maps status=identity_balance_exhausted to outcome=unavailable', async () => {
    const http = makeHttpMock({
      status: 200,
      data: { status: 'identity_balance_exhausted', error_message: 'Top up required' },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('identity_balance_exhausted');
  });

  // SpeedySMS uses a different shape ({success,code,message}) for billing /
  // auth refusals that happen before the NIN lookup runs. The real-world
  // identity_balance_exhausted body looks like this — the adapter must
  // surface the upstream message rather than a generic provider_unavailable.
  it('maps gate-shape {success:false, code, message} to outcome=unavailable with the real code + message', async () => {
    const http = makeHttpMock({
      status: 402,
      data: {
        success: false,
        code: 'identity_balance_exhausted',
        message: 'Your Identity balance is empty. Top up at /dashboard/identity/plans.',
      },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('identity_balance_exhausted');
    expect(r.error_message).toBe(
      'Your Identity balance is empty. Top up at /dashboard/identity/plans.'
    );
  });

  // The terminal gate codes — SpeedySMS uses the same envelope for not_found /
  // invalid as for refusals. These must map to outcome=failed so we charge
  // and short-circuit instead of retrying forever.
  it('maps gate-shape {success:false, code:"not_found"} to outcome=failed', async () => {
    const http = makeHttpMock({
      status: 200,
      data: { success: false, code: 'not_found', message: 'NIN not found' },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('failed');
    expect(r.error_code).toBe('not_found');
    expect(r.error_message).toBe('NIN not found');
  });

  // SpeedySMS's live success wire shape double-nests the profile:
  //   { success:true, message, data: { status:'success', lookup_id, data:{...profile}, photo_url, ... } }
  // The outer `data` is the IdentityLookupResult; the inner `data.data` is the
  // NormalizedData record with the actual name / DOB / address fields.
  it('maps HTTP 200 + {success:true, data:{status:failed, error}} to unavailable when message is wallet/balance (not verified)', async () => {
    const http = makeHttpMock({
      status: 200,
      data: {
        success: true,
        message: 'NIN verification failed',
        data: {
          status: 'failed',
          profile: { nin_last4: '5667' },
          error: {
            code: 'not_found',
            message: 'Insufficient wallet balance to process api call',
          },
        },
      },
    });
    const r = await speedysms.verifyNin('88379555667', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('identity_balance_exhausted');
    expect(r.error_message).toContain('wallet');
  });

  it('maps HTTP 200 + {success:true, data:{status:failed, error}} to outcome=failed for real NIN not_found', async () => {
    const http = makeHttpMock({
      status: 200,
      data: {
        success: true,
        message: 'Lookup failed',
        data: {
          status: 'failed',
          error: {
            code: 'not_found',
            message: 'NIN not found in national database',
          },
        },
      },
    });
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('failed');
    expect(r.error_code).toBe('not_found');
    expect(r.error_message).toContain('national database');
  });

  it('maps the double-nested success envelope to outcome=verified with the inner profile', async () => {
    const http = makeHttpMock({
      status: 200,
      data: {
        success: true,
        message: 'Lookup successful',
        data: {
          status: 'success',
          lookup_id: 'lookup-xyz',
          nin_last_4: '5660',
          data: {
            first_name: 'QUADRI',
            middle_name: 'OLASHINA',
            last_name: 'SIKIRU',
            date_of_birth: '2000-03-30',
            gender: 'male',
            phone_number: '08136156937',
            birthplace: { country: 'nigeria', state: null, lga: 'Ojo Lagos' },
            residence: { address: null, town: null, lga: 'Lagos', state: 'Lagos' },
            next_of_kin: { first_name: null, middle_name: null, last_name: null },
          },
          photo_url: 'https://s3.example/photo.jpg',
          signature_url: null,
        },
      },
    });
    const r = await speedysms.verifyNin('88379555660', { http });
    expect(r.outcome).toBe('verified');
    expect(r.provider_reference).toBe('lookup-xyz');
    expect(r.profile.first_name).toBe('QUADRI');
    expect(r.profile.middle_name).toBe('OLASHINA');
    expect(r.profile.last_name).toBe('SIKIRU');
    expect(r.profile.date_of_birth).toBe('2000-03-30');
    expect(r.profile.gender).toBe('male');
    expect(r.profile.phone).toBe('08136156937');
    expect(r.profile.phone_number).toBe('08136156937');
    expect(r.profile.photo_url).toBe('https://s3.example/photo.jpg');
    expect(r.profile.signature_url).toBeNull();
    expect(r.profile.provider_lookup).toMatchObject({
      lookup_id: 'lookup-xyz',
      nin_last_4: '5660',
    });
  });

  it('forwards provider + force_fresh overrides to the upstream POST body', async () => {
    const http = makeHttpMock({ status: 200, data: SUCCESS_BODY });
    await speedysms.verifyNin('00000000001', {
      http,
      provider: 'mock',
      force_fresh: true,
    });
    const [, body] = http.post.mock.calls[0];
    expect(body).toEqual({
      nin: '00000000001',
      provider: 'mock',
      force_fresh: true,
    });
  });

  it('omits provider / force_fresh from the body when not requested', async () => {
    const http = makeHttpMock({ status: 200, data: SUCCESS_BODY });
    await speedysms.verifyNin('12345678901', { http });
    const [, body] = http.post.mock.calls[0];
    expect(body).toEqual({ nin: '12345678901' });
    expect(body.provider).toBeUndefined();
    expect(body.force_fresh).toBeUndefined();
  });

  it('returns outcome=unavailable on network failure', async () => {
    const http = makeHttpReject(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('provider_unavailable');
    expect(r.error_message).toBe('ETIMEDOUT');
  });
});
