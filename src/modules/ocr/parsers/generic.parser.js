const { normalizeGrade } = require('./grade-normalizer');
const { normalizeLines, findAfter, extractYear } = require('../utils/text-cleanup');

const ANY_GRADE_RE = /^([A-F][1-9]?|U)$/i;

function parseGeneric(text, { detected = 'generic' } = {}) {
  const lines = normalizeLines(text);
  const subjects = [];
  const warnings = [];

  for (const line of lines) {
    const tokens = line.split(/\s+/);
    if (tokens.length < 2) continue;
    const last = tokens[tokens.length - 1].toUpperCase();
    if (!ANY_GRADE_RE.test(last)) continue;

    const name = tokens.slice(0, -1).join(' ').replace(/[:\-]+\s*$/, '').trim();
    if (!name || name.length < 3) continue;

    const norm = normalizeGrade(last, 'waec');
    subjects.push({
      name: name.toUpperCase(),
      code: null,
      grade: last,
      grade_normalized: norm.normalized,
      score: null
    });
    if (norm.warning) warnings.push(`unknown_grade:${name}:${last}`);
  }

  if (subjects.length === 0) warnings.push('no_subjects_parsed');
  warnings.push('low_confidence_parser:generic');

  return {
    exam_type: detected,
    exam_body: null,
    exam_year: extractYear(text),
    exam_diet: null,
    candidate: {
      name: findAfter(lines, 'NAME') || null,
      exam_number: findAfter(lines, 'EXAM\\.?\\s*NO') || findAfter(lines, 'REG\\.?\\s*NO') || null,
      centre_number: null,
      centre_name: null,
      date_of_birth: null
    },
    subjects,
    summary: {
      subject_count: subjects.length,
      credits: subjects.filter((s) => ['A', 'B', 'C'].includes(s.grade_normalized)).length,
      passes: subjects.filter(
        (s) => s.grade_normalized && s.grade_normalized !== 'F'
      ).length
    },
    warnings
  };
}

module.exports = { parseGeneric };
