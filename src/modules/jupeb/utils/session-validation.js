/**
 * @param {string} academicYear e.g. 2026/2027
 * @returns {{ ok: boolean, error?: string, firstYear?: number, secondYear?: number }}
 */
function validateAcademicYear(academicYear) {
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

/**
 * @param {string} academicYear
 * @param {string} yearShort two chars, last two digits of second year
 */
function validateYearShortForAcademicYear(academicYear, yearShort) {
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

const ALLOWED = {
  open: ['closed'],
  closed: ['open'],
};

function canTransitionStatus(from, to) {
  const next = ALLOWED[from];
  return Array.isArray(next) && next.includes(to);
}

/**
 * Every session window / deadline column, keyed by the logical name callers
 * use when asking "can this write still happen?".
 */
const SESSION_WINDOWS = {
  candidate_info: 'candidate_info_cutoff_at',
  profile_update: 'profile_update_cutoff_at',
  ca: 'ca_cutoff_at',
  student_submission: 'student_submission_deadline',
  institution_approval: 'institution_approval_deadline',
};

/** Human labels for error messages, keyed the same way as SESSION_WINDOWS. */
const WINDOW_LABELS = {
  candidate_info: 'Candidate information entry',
  profile_update: 'Profile update',
  ca: 'CA entry',
  student_submission: 'Student submission',
  institution_approval: 'Institution approval',
};

/**
 * `opens_at` / `closes_at` / the cutoff columns are TIMESTAMP WITHOUT TIME ZONE,
 * so node-pg hands them back as a local-time Date with no zone attached. Parse
 * them the same way the rest of the module does (`claimCode`, `nullableTime`):
 * plain `new Date(value)` and never append a `Z`, or the server's UTC offset is
 * applied twice. Returns null for absent/invalid values so callers can treat
 * "no bound configured" as "no restriction".
 */
function parseWindowBound(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Evaluate a session's registration window and every cutoff/deadline against
 * `now`. Pure — no DB access, no throws — so it can be unit tested and reused
 * by both enforcement paths and read endpoints that expose session state.
 *
 * A bound is "passed" once `now` reaches it (the bound instant itself is
 * closed). A null bound means no restriction.
 *
 * @param {object|null} session row from `jupeb_registration_sessions`
 * @param {Date} [now]
 * @returns {{
 *   now: string,
 *   opens_at: string|null, closes_at: string|null,
 *   has_opened: boolean, is_closed: boolean, within_window: boolean,
 *   cutoffs: Record<string, { field: string, at: string|null, passed: boolean }>,
 *   deadlines: Record<string, { field: string, at: string|null, passed: boolean }>,
 * }}
 */
function evaluateSessionWindows(session, now = new Date()) {
  const reference = now instanceof Date ? now : new Date(now);
  const at = reference.getTime();

  const evaluate = (key) => {
    const field = SESSION_WINDOWS[key];
    const bound = parseWindowBound(session ? session[field] : null);
    return {
      field,
      at: bound ? bound.toISOString() : null,
      passed: bound ? at >= bound.getTime() : false,
    };
  };

  const opens = parseWindowBound(session ? session.opens_at : null);
  const closes = parseWindowBound(session ? session.closes_at : null);
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

/** `yyyy-mm-dd hh:mm` — matches the formatting used by the session service. */
function formatWindowBound(date) {
  return date.toISOString().replace('T', ' ').substring(0, 16);
}

/**
 * Describe why a write inside a session is not allowed, or null when it is.
 *
 * `kind` is `'session_window'` for the opens_at/closes_at window, or a key of
 * `SESSION_WINDOWS` for one of the cutoffs/deadlines.
 *
 * @returns {{ message: string, status: number, details: object }|null}
 */
function describeSessionWindowFailure(session, kind, now = new Date()) {
  const windows = evaluateSessionWindows(session, now);

  if (kind === 'session_window') {
    if (!windows.has_opened) {
      return {
        status: 423,
        message: `Registrations for this session open on ${formatWindowBound(parseWindowBound(windows.opens_at))}`,
        details: {
          error_code: 'session_not_open',
          opens_at: windows.opens_at,
        },
      };
    }
    if (windows.is_closed) {
      return {
        status: 423,
        message: `Registrations for this session closed on ${formatWindowBound(parseWindowBound(windows.closes_at))}`,
        details: {
          error_code: 'session_window_closed',
          closes_at: windows.closes_at,
        },
      };
    }
    return null;
  }

  // Any other value must be a real cutoff/deadline key, so a typo in a call
  // site fails loudly instead of silently allowing the write.
  if (!SESSION_WINDOWS[kind]) {
    throw new Error(`Unknown session window kind: ${kind}`);
  }

  const cutoff = windows.cutoffs[kind] || windows.deadlines[kind];
  if (!cutoff || !cutoff.passed) return null;

  return {
    status: 423,
    message: `${WINDOW_LABELS[kind]} closed on ${formatWindowBound(parseWindowBound(cutoff.at))}`,
    details: {
      error_code: 'session_cutoff_passed',
      cutoff: cutoff.field,
      cutoff_at: cutoff.at,
    },
  };
}

module.exports = {
  validateAcademicYear,
  validateYearShortForAcademicYear,
  canTransitionStatus,
  SESSION_WINDOWS,
  evaluateSessionWindows,
  describeSessionWindowFailure,
};
