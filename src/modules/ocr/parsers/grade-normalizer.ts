/**
 * Collapse exam-specific raw grades into the A..F scale used by the
 * `academic` module's score rule.
 */

const WAEC_LIKE_MAP: Record<string, string> = {
  A1: 'A',
  A2: 'A',
  A3: 'A',
  B1: 'B',
  B2: 'B',
  B3: 'B',
  C1: 'C',
  C2: 'C',
  C3: 'C',
  C4: 'C',
  C5: 'C',
  C6: 'C',
  D7: 'D',
  E8: 'E',
  F9: 'F',
};

const GCE_MAP: Record<string, string> = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  E: 'E',
  U: 'F',
};

export interface NormalizedGradeResult {
  normalized: string | null;
  isCredit: boolean;
  isPass: boolean;
  warning: string | null;
}

export function normalizeGrade(rawGrade?: string | null, examType = 'waec'): NormalizedGradeResult {
  if (!rawGrade || typeof rawGrade !== 'string') {
    return { normalized: null, isCredit: false, isPass: false, warning: 'empty grade' };
  }
  const grade = rawGrade.trim().toUpperCase().replace(/[()[\],.:;\-_]/g, '').replace(/\s+/g, '');

  if (examType === 'gce') {
    if (GCE_MAP[grade]) {
      const normalized = GCE_MAP[grade];
      return {
        normalized,
        isCredit: ['A', 'B', 'C'].includes(normalized),
        isPass: normalized !== 'F',
        warning: null,
      };
    }
  }

  if (WAEC_LIKE_MAP[grade]) {
    const normalized = WAEC_LIKE_MAP[grade];
    return {
      normalized,
      isCredit: ['A', 'B', 'C'].includes(normalized),
      isPass: normalized !== 'F',
      warning: null,
    };
  }

  // Tolerate stray single-letter grades (e.g. raw text that lost the digit)
  if (/^[A-F]$/.test(grade)) {
    return {
      normalized: grade,
      isCredit: ['A', 'B', 'C'].includes(grade),
      isPass: grade !== 'F',
      warning: null,
    };
  }

  return {
    normalized: null,
    isCredit: false,
    isPass: false,
    warning: `unknown grade "${rawGrade}"`,
  };
}
