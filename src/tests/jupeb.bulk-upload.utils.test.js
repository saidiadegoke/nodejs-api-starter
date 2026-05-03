const { parseCsv, runBulk } = require('../modules/jupeb/utils/bulk-upload');

describe('bulk-upload utils', () => {
  describe('parseCsv', () => {
    it('parses CRLF and LF line endings', () => {
      expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ]);
      expect(parseCsv('a,b\n1,2\n3,4')).toEqual([
        { a: '1', b: '2' },
        { a: '3', b: '4' },
      ]);
    });

    it('trims header whitespace and downcases header keys', () => {
      expect(parseCsv(' Code , Name \nMTH,Maths')).toEqual([
        { code: 'MTH', name: 'Maths' },
      ]);
    });

    it('strips trailing empty lines and leaves embedded empties as empty strings', () => {
      expect(parseCsv('a,b\n,2\n3,\n')).toEqual([
        { a: '', b: '2' },
        { a: '3', b: '' },
      ]);
    });

    it('supports double-quoted fields with embedded commas and escaped quotes', () => {
      expect(parseCsv('code,name\nMTH,"Maths, Pure"\nFOO,"He said ""hi"""')).toEqual([
        { code: 'MTH', name: 'Maths, Pure' },
        { code: 'FOO', name: 'He said "hi"' },
      ]);
    });

    it('returns empty array on header-only input', () => {
      expect(parseCsv('a,b')).toEqual([]);
    });

    it('returns empty array on blank/whitespace input', () => {
      expect(parseCsv('')).toEqual([]);
      expect(parseCsv('\n\n')).toEqual([]);
    });
  });

  describe('runBulk', () => {
    async function processor(row) {
      if (row.code === 'BAD') throw Object.assign(new Error('bad row'), { code: 'invalid' });
      return { id: `id-${row.code}` };
    }

    it('processes each row and aggregates per-row outcomes', async () => {
      const rows = [{ code: 'A' }, { code: 'BAD' }, { code: 'B' }];
      const result = await runBulk(rows, processor);
      expect(result.total).toBe(3);
      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.outcomes).toEqual([
        { row: 1, ok: true, data: { id: 'id-A' } },
        { row: 2, ok: false, error_code: 'invalid', error_message: 'bad row' },
        { row: 3, ok: true, data: { id: 'id-B' } },
      ]);
    });

    it('continues past errors (not short-circuit)', async () => {
      const rows = [{ code: 'BAD' }, { code: 'BAD' }, { code: 'OK' }];
      const result = await runBulk(rows, processor);
      expect(result.failed).toBe(2);
      expect(result.succeeded).toBe(1);
    });

    it('caps row count via maxRows', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({ code: `R${i}` }));
      await expect(runBulk(rows, processor, { maxRows: 3 })).rejects.toMatchObject({
        status: 413,
        code: 'too_many_rows',
      });
    });

    it('returns total:0 succeeded:0 on an empty array', async () => {
      const result = await runBulk([], processor);
      expect(result).toMatchObject({ total: 0, succeeded: 0, failed: 0, outcomes: [] });
    });
  });
});
