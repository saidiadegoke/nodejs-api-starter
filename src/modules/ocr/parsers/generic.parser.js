const { normalizeGrade } = require('./grade-normalizer');
const { normalizeLines, findAfter, extractYear } = require('../utils/text-cleanup');

const ANY_GRADE_RE = /^([A-F][1-9]?|U)$/i;

const IGNORE_PATTERNS = [
  /^(SUBJECT|GRADE|REMARK|POINT|SCORE|SERIAL|S\/N|NO\.|EXAMINATION|CANDIDATE|CENTRE|DATE|OFFICIAL|STATEMENT|COUNCIL|RESULT SLIP|PROVISIONAL RESULT)/i,
  /^(TOTAL|CREDITS?|PASSES?|PAGE|PRINTED|REGISTRAR|SECRETARY|DATE OF BIRTH)/i,
  /^[=\-_|~.+*#]+$/,
];

function isGrade(token) {
  const clean = (token || '').toUpperCase().replace(/[()[\],.:;\-_]/g, '');
  return ANY_GRADE_RE.test(clean);
}

function parseGeneric(text, { detected = 'generic' } = {}) {
  const lines = normalizeLines(text);
  const subjects = [];
  const warnings = [];

  for (const line of lines) {
    const sanitized = line.replace(/[|:;~_]/g, ' ').replace(/\.{2,}/g, ' ');
    const tokens = sanitized.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) continue;

    let gradeIdx = -1;
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      if (isGrade(tokens[i])) {
        gradeIdx = i;
        break;
      }
    }
    if (gradeIdx < 1) continue;

    const rawGrade = tokens[gradeIdx];
    const grade = rawGrade.toUpperCase().replace(/[()[\],.:;\-_]/g, '');
    const beforeGrade = tokens.slice(0, gradeIdx);

    if (/^\d{1,4}[.)\]]?$/.test(beforeGrade[0] || '')) {
      beforeGrade.shift();
    }

    const name = beforeGrade.join(' ').replace(/[:\-+*#|~.]+\s*$/, '').trim();
    if (!name || name.length < 2) continue;

    let shouldIgnore = false;
    for (const pat of IGNORE_PATTERNS) {
      if (pat.test(name)) {
        shouldIgnore = true;
        break;
      }
    }
    if (shouldIgnore) continue;

    const norm = normalizeGrade(grade, 'waec');
    subjects.push({
      name: name.toUpperCase(),
      code: null,
      grade,
      grade_normalized: norm.normalized,
      score: null
    });
    if (norm.warning) warnings.push(`unknown_grade:${name}:${grade}`);
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
