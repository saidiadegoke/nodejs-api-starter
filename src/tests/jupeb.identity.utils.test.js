const {
  normalizeNin,
  hashNin,
  ninLast4,
  validateBiometricPayload,
} = require('../modules/jupeb/utils/identity-crypto');

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
