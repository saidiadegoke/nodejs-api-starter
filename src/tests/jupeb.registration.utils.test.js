const { canTransition } = require('../modules/jupeb/services/registration-state.service');
const { formatCandidateNumber } = require('../modules/jupeb/utils/registration-numbering');

describe('JUPEB registration utils', () => {
  it('formatCandidateNumber matches DB-style pattern', () => {
    expect(formatCandidateNumber('24', '001', 7)).toBe('240010007');
    // year_short is two digits; jupeb_prefix is three digits from catalog
    expect(formatCandidateNumber('25', '012', 9999)).toBe('250129999');
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
