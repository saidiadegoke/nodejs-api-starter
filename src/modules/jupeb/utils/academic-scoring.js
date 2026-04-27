const VALID_GRADES = new Set(['A', 'B', 'C', 'D', 'E', 'F']);

function isValidGrade(grade) {
  return typeof grade === 'string' && VALID_GRADES.has(grade.toUpperCase());
}

function normalizeGrade(grade) {
  return String(grade).trim().toUpperCase().slice(0, 1);
}

/** A–E → +1 point each; F → 0 (see docs/007-jupeb-academic-technical-design.md). */
function gradeToPlusOneAwarded(grade) {
  const g = normalizeGrade(grade);
  if (!isValidGrade(g)) return null;
  return g !== 'F';
}

/**
 * @param {Array<{ grade: string }>} rows
 * @returns {{ passed_courses_count: number, failed_courses_count: number, plus_one_total: number }}
 */
function aggregateScoresFromResults(rows) {
  let passed = 0;
  let failed = 0;
  let plusOne = 0;
  for (const row of rows) {
    const g = normalizeGrade(row.grade);
    if (g === 'F') failed += 1;
    else if (isValidGrade(g)) {
      passed += 1;
      plusOne += 1;
    }
  }
  return {
    passed_courses_count: passed,
    failed_courses_count: failed,
    plus_one_total: plusOne,
  };
}

module.exports = {
  VALID_GRADES,
  isValidGrade,
  normalizeGrade,
  gradeToPlusOneAwarded,
  aggregateScoresFromResults,
};
