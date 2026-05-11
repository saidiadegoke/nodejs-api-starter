const { normalizeGrade } = require('./grade-normalizer');
const {
  normalizeLines,
  findAfter,
  tryParseDate,
  extractYear,
  extractDiet
} = require('../utils/text-cleanup');

const NECO_GRADES = ['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'];
const isGrade = (t) => NECO_GRADES.includes((t || '').toUpperCase());

function parseSubjectRow(line) {
  // NECO often prints "SUBJECT  SCORE  GRADE", e.g.
  //   "ENGLISH LANGUAGE   72   B2"
  const tokens = line.split(/\s+/);
  let gradeIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (isGrade(tokens[i])) {
      gradeIdx = i;
      break;
    }
  }
  if (gradeIdx <= 0) return null;

  const grade = tokens[gradeIdx].toUpperCase();
  let score = null;
  let nameTokens = tokens.slice(0, gradeIdx);

  // Optional numeric score immediately before the grade
  const maybeScore = nameTokens[nameTokens.length - 1];
  if (/^\d{1,3}$/.test(maybeScore || '')) {
    const n = parseInt(maybeScore, 10);
    if (n >= 0 && n <= 100) {
      score = n;
      nameTokens = nameTokens.slice(0, -1);
    }
  }

  let code = null;
  if (/^\d{2,4}$/.test(nameTokens[0] || '')) {
    code = nameTokens.shift();
  }

  const name = nameTokens.join(' ').replace(/[:\-]+\s*$/, '').trim();
  if (!name || name.length < 3) return null;

  const norm = normalizeGrade(grade, 'neco');
  return {
    subject: {
      name: name.toUpperCase(),
      code,
      grade,
      grade_normalized: norm.normalized,
      score
    },
    warning: norm.warning ? `unknown_grade:${name}:${grade}` : null
  };
}

function parseNeco(text, { detected = 'neco' } = {}) {
  const lines = normalizeLines(text);
  const head = lines.slice(0, 30).join(' ');

  const candidate = {
    name: findAfter(lines, 'NAME') || findAfter(lines, 'CANDIDATE NAME'),
    exam_number:
      findAfter(lines, 'REG\\.?\\s*NO') ||
      findAfter(lines, 'REGISTRATION NUMBER') ||
      findAfter(lines, 'EXAM\\.?\\s*NO'),
    centre_number: findAfter(lines, 'CENTRE\\s*NO'),
    centre_name: findAfter(lines, 'CENTRE'),
    date_of_birth: tryParseDate(findAfter(lines, 'DATE\\s*OF\\s*BIRTH'))
  };

  const subjects = [];
  const warnings = [];
  for (const line of lines) {
    if (!line.split(/\s+/).some(isGrade)) continue;
    const parsed = parseSubjectRow(line);
    if (!parsed) continue;
    subjects.push(parsed.subject);
    if (parsed.warning) warnings.push(parsed.warning);
  }

  const credits = subjects.filter((s) => ['A', 'B', 'C'].includes(s.grade_normalized)).length;
  const passes = subjects.filter(
    (s) => s.grade_normalized && s.grade_normalized !== 'F'
  ).length;

  if (!candidate.exam_number) warnings.push('low_confidence_field:candidate.exam_number');
  if (!candidate.name) warnings.push('low_confidence_field:candidate.name');
  if (subjects.length === 0) warnings.push('no_subjects_parsed');

  const explicitYear = findAfter(lines, 'EXAM(?:INATION)?\\s*YEAR') ||
    findAfter(lines, 'YEAR\\s*OF\\s*EXAMINATION');
  const examYear = (explicitYear && extractYear(explicitYear)) ||
    extractYear(head) ||
    extractYear(text);

  return {
    exam_type: detected,
    exam_body: 'NATIONAL EXAMINATIONS COUNCIL',
    exam_year: examYear,
    exam_diet: extractDiet(head) || extractDiet(text),
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

module.exports = { parseNeco };
