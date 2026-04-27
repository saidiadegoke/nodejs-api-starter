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
  draft: ['open'],
  open: ['closed'],
  closed: ['archived', 'open'],
  archived: [],
};

function canTransitionStatus(from, to) {
  const next = ALLOWED[from];
  return Array.isArray(next) && next.includes(to);
}

module.exports = {
  validateAcademicYear,
  validateYearShortForAcademicYear,
  canTransitionStatus,
};
