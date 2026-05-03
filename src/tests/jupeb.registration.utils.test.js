const { canTransition } = require('../modules/jupeb/services/registration-state.service');
const { formatCandidateNumber, makeInstitutionCode } = require('../modules/jupeb/utils/registration-numbering');

describe('JUPEB registration utils', () => {
  it('formatCandidateNumber matches DB-style pattern', () => {
    expect(formatCandidateNumber('24', '001', 7)).toBe('240010007');
    // year_short is two digits; jupeb_prefix is three digits from catalog
    expect(formatCandidateNumber('25', '012', 9999)).toBe('250129999');
  });

  describe('makeInstitutionCode', () => {
    it('returns a 6-character uppercase alphanumeric code by default (no confusing chars)', () => {
      const code = makeInstitutionCode();
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    });

    it('honors JUPEB_INSTITUTION_CODE_LENGTH env override', () => {
      const original = process.env.JUPEB_INSTITUTION_CODE_LENGTH;
      try {
        process.env.JUPEB_INSTITUTION_CODE_LENGTH = '8';
        expect(makeInstitutionCode()).toHaveLength(8);
      } finally {
        if (original === undefined) delete process.env.JUPEB_INSTITUTION_CODE_LENGTH;
        else process.env.JUPEB_INSTITUTION_CODE_LENGTH = original;
      }
    });
  });

  it('canTransition allows expected edges', () => {
    expect(canTransition('code_issued', 'claimed')).toBe(true);
    expect(canTransition('claimed', 'pending_documents')).toBe(true);
    expect(canTransition('pending_documents', 'pending_institution_review')).toBe(true);
    expect(canTransition('pending_institution_review', 'approved')).toBe(true);
    expect(canTransition('pending_institution_review', 'rejected')).toBe(true);
    expect(canTransition('approved', 'rejected')).toBe(false);
    expect(canTransition('code_issued', 'approved')).toBe(false);
  });
});
