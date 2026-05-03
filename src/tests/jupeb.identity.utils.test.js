const {
  normalizeNin,
  hashNin,
  ninLast4,
  validateBiometricPayload,
} = require('../modules/jupeb/utils/identity-crypto');
const ninAdapter = require('../modules/jupeb/services/nin-adapter.service');

describe('JUPEB identity crypto utils', () => {
  describe('normalizeNin', () => {
    it('strips non-digits', () => {
      expect(normalizeNin(' 123 456 789 01 ')).toBe('12345678901');
    });

    it('rejects empty', () => {
      expect(normalizeNin('')).toBe('');
    });
  });

  describe('hashNin', () => {
    it('returns 64-char hex', () => {
      const h = hashNin('12345678901');
      expect(h).toHaveLength(64);
      expect(h).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('ninLast4', () => {
    it('returns last four digits', () => {
      expect(ninLast4('12345678901')).toBe('8901');
    });
  });

  describe('validateBiometricPayload', () => {
    it('requires file_id or external_reference', () => {
      expect(validateBiometricPayload({ capture_type: 'face' }).ok).toBe(false);
      expect(
        validateBiometricPayload({ capture_type: 'face', file_id: '00000000-0000-0000-0000-000000000001' }).ok
      ).toBe(true);
      expect(
        validateBiometricPayload({ capture_type: 'fingerprint', external_reference: 'vault-1' }).ok
      ).toBe(true);
    });

    it('rejects both file_id and external_reference', () => {
      expect(
        validateBiometricPayload({
          capture_type: 'face',
          file_id: '00000000-0000-0000-0000-000000000001',
          external_reference: 'x',
        }).ok
      ).toBe(false);
    });
  });
});

describe('nin-adapter outcome contract', () => {
  const ORIGINAL_FORCE = process.env.JUPEB_NIN_FORCE_UNAVAILABLE;

  afterEach(() => {
    if (ORIGINAL_FORCE === undefined) delete process.env.JUPEB_NIN_FORCE_UNAVAILABLE;
    else process.env.JUPEB_NIN_FORCE_UNAVAILABLE = ORIGINAL_FORCE;
  });

  it('returns outcome=verified with profile and provider_reference for a well-formed NIN', async () => {
    delete process.env.JUPEB_NIN_FORCE_UNAVAILABLE;
    const result = await ninAdapter.verifyNin('12345678901');
    expect(result.outcome).toBe('verified');
    expect(typeof result.provider_reference).toBe('string');
    expect(result.profile).toBeDefined();
    expect(result.profile.first_name).toBeDefined();
  });

  it('verified profile includes address, state_of_origin, lga, place_of_birth, phone, next_of_kin, photo_url', async () => {
    delete process.env.JUPEB_NIN_FORCE_UNAVAILABLE;
    const result = await ninAdapter.verifyNin('12345678901');
    expect(result.outcome).toBe('verified');
    expect(result.profile.address).toBeDefined();
    expect(result.profile.state_of_origin).toBeDefined();
    expect(result.profile.lga).toBeDefined();
    expect(result.profile.place_of_birth).toBeDefined();
    expect(result.profile.phone).toBeDefined();
    expect(result.profile.next_of_kin).toBeDefined();
    expect(result.profile.next_of_kin.name).toBeDefined();
    expect(result.profile.next_of_kin.contact).toBeDefined();
    expect(result.profile.photo_url).toBeDefined();
  });

  it('returns outcome=failed with error_code=invalid_nin for malformed input', async () => {
    delete process.env.JUPEB_NIN_FORCE_UNAVAILABLE;
    const tooShort = await ninAdapter.verifyNin('123');
    expect(tooShort.outcome).toBe('failed');
    expect(tooShort.error_code).toBe('invalid_nin');

    const allZeros = await ninAdapter.verifyNin('00000000000');
    expect(allZeros.outcome).toBe('failed');
    expect(allZeros.error_code).toBe('invalid_nin');
  });

  it('returns outcome=unavailable with retry_after_seconds when JUPEB_NIN_FORCE_UNAVAILABLE=1', async () => {
    process.env.JUPEB_NIN_FORCE_UNAVAILABLE = '1';
    const result = await ninAdapter.verifyNin('12345678901');
    expect(result.outcome).toBe('unavailable');
    expect(result.error_code).toBeDefined();
    expect(typeof result.retry_after_seconds).toBe('number');
    expect(result.retry_after_seconds).toBeGreaterThan(0);
  });
});
