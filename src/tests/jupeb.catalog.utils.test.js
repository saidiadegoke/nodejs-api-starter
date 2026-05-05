const {
  validateJupebPrefix,
  normalizeSubjects,
} = require('../modules/jupeb/utils/catalog-validation');

describe('JUPEB catalog validation utils', () => {
  describe('validateJupebPrefix', () => {
    it('accepts exactly three digits', () => {
      expect(validateJupebPrefix('001').ok).toBe(true);
      expect(validateJupebPrefix('999').ok).toBe(true);
    });

    it('rejects wrong length or non-numeric', () => {
      expect(validateJupebPrefix('01').ok).toBe(false);
      expect(validateJupebPrefix('0001').ok).toBe(false);
      expect(validateJupebPrefix('AB1').ok).toBe(false);
      expect(validateJupebPrefix('').ok).toBe(false);
    });
  });

  describe('normalizeSubjects', () => {
    it('trims, dedupes case-insensitively, enforces 3–6 unique subjects', () => {
      const r = normalizeSubjects(['  English ', 'english', 'Lit', ' Gov ']);
      expect(r.error).toBeNull();
      expect(r.subjects).toEqual(['English', 'Lit', 'Gov']);
    });

    it('rejects fewer than three subjects', () => {
      const r = normalizeSubjects(['A', 'B']);
      expect(r.subjects).toBeNull();
      expect(r.error).toMatch(/at least 3/i);
    });

    it('rejects more than six subjects', () => {
      const r = normalizeSubjects(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
      expect(r.subjects).toBeNull();
      expect(r.error).toMatch(/at most 6/i);
    });
  });
});
