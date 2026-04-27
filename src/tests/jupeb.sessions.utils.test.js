const {
  validateAcademicYear,
  validateYearShortForAcademicYear,
  canTransitionStatus,
} = require('../modules/jupeb/utils/session-validation');

describe('JUPEB session validation utils', () => {
  describe('validateAcademicYear', () => {
    it('accepts YYYY/YYYY', () => {
      expect(validateAcademicYear('2026/2027').ok).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(validateAcademicYear('26/27').ok).toBe(false);
      expect(validateAcademicYear('2026-2027').ok).toBe(false);
      expect(validateAcademicYear('').ok).toBe(false);
    });

    it('rejects non-consecutive years', () => {
      expect(validateAcademicYear('2026/2028').ok).toBe(false);
    });
  });

  describe('validateYearShortForAcademicYear', () => {
    it('requires year_short to match last two digits of second year', () => {
      expect(validateYearShortForAcademicYear('2026/2027', '27').ok).toBe(true);
      expect(validateYearShortForAcademicYear('2026/2027', '26').ok).toBe(false);
    });
  });

  describe('canTransitionStatus', () => {
    it('allows draft->open, open->closed, closed->archived', () => {
      expect(canTransitionStatus('draft', 'open')).toBe(true);
      expect(canTransitionStatus('open', 'closed')).toBe(true);
      expect(canTransitionStatus('closed', 'archived')).toBe(true);
    });

    it('disallows invalid jumps', () => {
      expect(canTransitionStatus('draft', 'closed')).toBe(false);
      expect(canTransitionStatus('archived', 'open')).toBe(false);
    });

    it('allows closed->open for reopen flow', () => {
      expect(canTransitionStatus('closed', 'open')).toBe(true);
    });
  });
});
