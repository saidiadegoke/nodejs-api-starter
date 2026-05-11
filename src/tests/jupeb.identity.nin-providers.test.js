const registry = require('../modules/jupeb/services/nin-providers');
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

  it('defaults to mock when JUPEB_NIN_PROVIDER is unset', () => {
    const prior = process.env.JUPEB_NIN_PROVIDER;
    delete process.env.JUPEB_NIN_PROVIDER;
    expect(registry.resolveName()).toBe('mock');
    if (prior !== undefined) process.env.JUPEB_NIN_PROVIDER = prior;
  });

  it('falls back to mock when JUPEB_NIN_PROVIDER names an unknown provider', () => {
    const prior = process.env.JUPEB_NIN_PROVIDER;
    process.env.JUPEB_NIN_PROVIDER = 'does-not-exist';
    expect(registry.resolveName()).toBe('mock');
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
    expect(body).toEqual({ nin: '12345678901' });
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

  it('returns outcome=unavailable on network failure', async () => {
    const http = makeHttpReject(Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }));
    const r = await speedysms.verifyNin('12345678901', { http });
    expect(r.outcome).toBe('unavailable');
    expect(r.error_code).toBe('provider_unavailable');
    expect(r.error_message).toBe('ETIMEDOUT');
  });
});
