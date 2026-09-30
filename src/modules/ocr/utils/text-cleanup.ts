/**
 * Light helpers for OCR text — collapsing whitespace, parsing dates, etc.
 */

export function normalizeLines(text?: string | null): string[] {
  if (!text) return [];
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean);
}

export function stripLeadingPunct(s: string): string {
  if (!s) return s;
  return s.replace(/^[^\w(]+/, '').trim();
}

export function findAfter(lines: string[], label: string, { window = 5 }: { window?: number } = {}): string | null {
  const reInline = new RegExp(`^${label}[^\\w(]*\\s*(.+)$`, 'i');
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(reInline);
    if (m && m[1].trim()) return stripLeadingPunct(m[1]);
    if (lines[i].toUpperCase().startsWith(label.toUpperCase().replace(/\\./g, '.'))) {
      for (let j = 1; j <= window; j += 1) {
        const next = lines[i + j];
        if (next && next.trim()) return stripLeadingPunct(next);
      }
    }
  }
  return null;
}

export function tryParseDate(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const cleaned = input.trim();

  // ISO yyyy-mm-dd
  let m = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return cleaned;

  // dd/mm/yyyy or dd-mm-yyyy
  m = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // dd Mon yyyy
  const months: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  };
  m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (m) {
    const mon = months[m[2].slice(0, 3).toUpperCase()];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

export function extractYear(text?: string | null): number | null {
  const m = text && text.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

export function extractDiet(text?: string | null): string | null {
  if (!text) return null;
  if (/MAY\s*\/\s*JUNE/i.test(text)) return 'May/June';
  if (/NOV(?:EMBER)?\s*\/\s*DEC(?:EMBER)?/i.test(text)) return 'November/December';
  if (/PRIVATE/i.test(text)) return 'Private';
  return null;
}
