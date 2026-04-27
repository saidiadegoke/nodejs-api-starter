const { mimeAllowed, sizeAllowed } = require('../modules/jupeb/utils/submission-validation');

describe('JUPEB submission validation utils', () => {
  describe('mimeAllowed', () => {
    it('allows any mime when list empty', () => {
      expect(mimeAllowed('application/pdf', [])).toBe(true);
      expect(mimeAllowed('application/pdf', null)).toBe(true);
    });

    it('matches allowed mime types', () => {
      expect(mimeAllowed('application/pdf', ['application/pdf'])).toBe(true);
      expect(mimeAllowed('APPLICATION/PDF', ['application/pdf'])).toBe(true);
    });

    it('rejects when not in list', () => {
      expect(mimeAllowed('image/png', ['application/pdf'])).toBe(false);
    });
  });

  describe('sizeAllowed', () => {
    it('enforces max mb', () => {
      expect(sizeAllowed(2 * 1024 * 1024, 1)).toBe(false);
      expect(sizeAllowed(512 * 1024, 1)).toBe(true);
    });

    it('allows null file size', () => {
      expect(sizeAllowed(null, 10)).toBe(true);
    });
  });
});
