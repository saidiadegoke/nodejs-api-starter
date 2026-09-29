export interface AcademicYearValidationResult {
  ok: boolean;
  error?: string;
  firstYear?: number;
  secondYear?: number;
}

export function validateAcademicYear(academicYear: string): AcademicYearValidationResult {
  if (typeof academicYear !== 'string' || !/^\d{4}\/\d{4}$/.test(academicYear.trim())) {
    return { ok: false, error: 'academic_year must match YYYY/YYYY' };
  }
  const [a, b] = academicYear.trim().split('/');
  const y1 = parseInt(a, 10);
  const y2 = parseInt(b, 10);
  if (Number.isNaN(y1) || Number.isNaN(y2) || y2 !== y1 + 1) {
    return { ok: false, error: 'academic_year must use consecutive calendar years (e.g. 2026/2027)' };
  }
  return { ok: true, firstYear: y1, secondYear: y2 };
}

export function validateYearShortForAcademicYear(
  academicYear: string,
  yearShort: string,
): AcademicYearValidationResult {
  const v = validateAcademicYear(academicYear);
  if (!v.ok) return v;
  const expected = String(v.secondYear).slice(-2);
  if (typeof yearShort !== 'string' || yearShort.trim().length !== 2) {
    return { ok: false, error: 'year_short must be two characters' };
  }
  if (yearShort.trim() !== expected) {
    return {
      ok: false,
      error: `year_short must be "${expected}" for academic_year ${academicYear.trim()}`,
    };
  }
  return { ok: true, firstYear: v.firstYear, secondYear: v.secondYear };
}

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['closed'],
  closed: ['open'],
};

export function canTransitionStatus(from: string, to: string): boolean {
  const next = ALLOWED_TRANSITIONS[from];
  return Array.isArray(next) && next.includes(to);
}

export const SESSION_WINDOWS: Record<string, string> = {
  candidate_info: 'candidate_info_cutoff_at',
  profile_update: 'profile_update_cutoff_at',
  ca: 'ca_cutoff_at',
  student_submission: 'student_submission_deadline',
  institution_approval: 'institution_approval_deadline',
};

export const WINDOW_LABELS: Record<string, string> = {
  candidate_info: 'Candidate information entry',
  profile_update: 'Profile update',
  ca: 'CA entry',
  student_submission: 'Student submission',
  institution_approval: 'Institution approval',
};

export function parseWindowBound(value?: Date | string | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface WindowEvaluationItem {
  field: string;
  at: string | null;
  passed: boolean;
}

export interface SessionWindowsEvaluation {
  now: string;
  opens_at: string | null;
  closes_at: string | null;
  has_opened: boolean;
  is_closed: boolean;
  within_window: boolean;
  cutoffs: Record<string, WindowEvaluationItem>;
  deadlines: Record<string, WindowEvaluationItem>;
}

export function evaluateSessionWindows(
  session: Record<string, any> | null,
  now: Date = new Date(),
): SessionWindowsEvaluation {
  const reference = now instanceof Date ? now : new Date(now);
  const at = reference.getTime();

  const evaluate = (key: string): WindowEvaluationItem => {
    const field = SESSION_WINDOWS[key];
    const camelField = field.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
    const val = session ? (session[field] ?? session[camelField]) : null;
    const bound = parseWindowBound(val);
    return {
      field,
      at: bound ? bound.toISOString() : null,
      passed: bound ? at >= bound.getTime() : false,
    };
  };

  const opensVal = session ? (session.opens_at ?? session.opensAt) : null;
  const closesVal = session ? (session.closes_at ?? session.closesAt) : null;
  const opens = parseWindowBound(opensVal);
  const closes = parseWindowBound(closesVal);
  const hasOpened = opens ? at >= opens.getTime() : true;
  const isClosed = closes ? at >= closes.getTime() : false;

  return {
    now: reference.toISOString(),
    opens_at: opens ? opens.toISOString() : null,
    closes_at: closes ? closes.toISOString() : null,
    has_opened: hasOpened,
    is_closed: isClosed,
    within_window: hasOpened && !isClosed,
    cutoffs: {
      candidate_info: evaluate('candidate_info'),
      profile_update: evaluate('profile_update'),
      ca: evaluate('ca'),
    },
    deadlines: {
      student_submission: evaluate('student_submission'),
      institution_approval: evaluate('institution_approval'),
    },
  };
}

export function formatWindowBound(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 16);
}
