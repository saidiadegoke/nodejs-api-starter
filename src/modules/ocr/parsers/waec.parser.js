const { normalizeGrade } = require('./grade-normalizer');
const {
  normalizeLines,
  findAfter,
  tryParseDate,
  extractYear,
  extractDiet
} = require('../utils/text-cleanup');

const SUBJECT_LINE_RE = /^([A-Z][A-Z .&\-/()0-9]{2,60}?)\s+([A-F][1-9]?)\s*$/;

const WAEC_GRADES = [
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3',
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'D7', 'E8', 'F9'
];
function isWaecGrade(token) {
  const t = (token || '').toUpperCase();
  return WAEC_GRADES.includes(t) || /^[A-F][1-9]?$/.test(t);
}

function parseSubjects(lines) {
  const subjects = [];
  const warnings = [];

  for (const line of lines) {
    if (!isLikelySubjectRow(line)) continue;
    const parsed = parseSubjectRow(line);
    if (!parsed) continue;
    subjects.push(parsed.subject);
    if (parsed.warning) warnings.push(parsed.warning);
  }
  return { subjects, warnings };
}

function isLikelySubjectRow(line) {
  // Must contain a WAEC-style grade somewhere
  const tokens = line.split(/\s+/);
  return tokens.some(isWaecGrade);
}

function parseSubjectRow(line) {
  // Pull the trailing grade and treat the rest as the subject name.
  const tokens = line.split(/\s+/);
  let gradeIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (isWaecGrade(tokens[i])) {
      gradeIdx = i;
      break;
    }
  }
  if (gradeIdx <= 0) return null;

  const grade = tokens[gradeIdx].toUpperCase();
  const beforeGrade = tokens.slice(0, gradeIdx);

  // Some certificates include a numeric subject code at the start.
  let code = null;
  if (/^\d{2,4}$/.test(beforeGrade[0] || '')) {
    code = beforeGrade.shift();
  }

  const name = beforeGrade.join(' ').replace(/[:\-]+\s*$/, '').trim();
  if (!name || name.length < 3) return null;

  const norm = normalizeGrade(grade, 'waec');

  return {
    subject: {
      name: name.toUpperCase(),
      code,
      grade,
      grade_normalized: norm.normalized,
      score: null
    },
    warning: norm.warning ? `unknown_grade:${name}:${grade}` : null
  };
}

function parseWaec(text, { detected = 'waec' } = {}) {
  const lines = normalizeLines(text);
  const headLines = lines.slice(0, 30);

  const candidate = {
    name: findAfter(lines, 'NAME') || findAfter(lines, 'CANDIDATE NAME'),
    exam_number:
      findAfter(lines, 'EXAM\\.?\\s*NO') ||
      findAfter(lines, 'EXAMINATION NUMBER') ||
      findAfter(lines, 'CANDIDATE NUMBER'),
    centre_number: findAfter(lines, 'CENTRE\\s*NO') || findAfter(lines, 'CENTRE NUMBER'),
    centre_name: findAfter(lines, 'CENTRE\\s*NAME') || findAfter(lines, 'CENTRE'),
    date_of_birth: tryParseDate(findAfter(lines, 'DATE\\s*OF\\s*BIRTH'))
  };

  const { subjects, warnings } = parseSubjects(lines);
  const credits = subjects.filter((s) => ['A', 'B', 'C'].includes(s.grade_normalized)).length;
  const passes = subjects.filter(
    (s) => s.grade_normalized && s.grade_normalized !== 'F'
  ).length;

  const explicitYear = findAfter(lines, 'EXAM(?:INATION)?\\s*YEAR') ||
    findAfter(lines, 'YEAR\\s*OF\\s*EXAMINATION');
  const examYear = (explicitYear && extractYear(explicitYear)) ||
    extractYear(headLines.join(' ')) ||
    extractYear(text);
  const examDiet = extractDiet(headLines.join(' ')) || extractDiet(text);

  if (!candidate.exam_number) warnings.push('low_confidence_field:candidate.exam_number');
  if (!candidate.name) warnings.push('low_confidence_field:candidate.name');
  if (!candidate.date_of_birth) warnings.push('low_confidence_field:candidate.date_of_birth');
  if (subjects.length === 0) warnings.push('no_subjects_parsed');

  return {
    exam_type: detected,
    exam_body: 'WEST AFRICAN EXAMINATIONS COUNCIL',
    exam_year: examYear,
    exam_diet: examDiet,
    candidate,
    subjects,
    summary: {
      subject_count: subjects.length,
      credits,
      passes
    },
    warnings
  };
}

module.exports = { parseWaec };
