import { normalizeGrade } from './grade-normalizer';
import {
  normalizeLines,
  findAfter,
  tryParseDate,
  extractYear,
} from '../utils/text-cleanup';

const A_LEVEL_RE = /^[A-EU]$/;
const SSCE_RE = /^([A-F][1-9]?)$/;

function parseSubjectRow(line: string) {
  const tokens = line.split(/\s+/);
  let gradeIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const tok = (tokens[i] || '').toUpperCase();
    if (A_LEVEL_RE.test(tok) || SSCE_RE.test(tok)) {
      gradeIdx = i;
      break;
    }
  }
  if (gradeIdx <= 0) return null;
  const grade = tokens[gradeIdx].toUpperCase();
  const nameTokens = tokens.slice(0, gradeIdx);
  if (!nameTokens.length) return null;

  const name = nameTokens.join(' ').replace(/[:-]+\s*$/, '').trim();
  if (!name || name.length < 3) return null;

  const norm = normalizeGrade(grade, 'gce');
  return {
    subject: {
      name: name.toUpperCase(),
      code: null,
      grade,
      grade_normalized: norm.normalized,
      score: null,
    },
    warning: norm.warning ? `unknown_grade:${name}:${grade}` : null,
  };
}

export function parseGce(text: string, { detected = 'gce' }: { detected?: string } = {}) {
  const lines = normalizeLines(text);
  const candidate = {
    name: findAfter(lines, 'NAME') || findAfter(lines, 'CANDIDATE NAME'),
    exam_number:
      findAfter(lines, 'CANDIDATE NUMBER') ||
      findAfter(lines, 'REGISTRATION NUMBER') ||
      findAfter(lines, 'EXAM\\.?\\s*NO'),
    centre_number: findAfter(lines, 'CENTRE\\s*NO'),
    centre_name: findAfter(lines, 'CENTRE'),
    date_of_birth: tryParseDate(findAfter(lines, 'DATE\\s*OF\\s*BIRTH')),
  };

  const subjects: any[] = [];
  const warnings: string[] = [];
  for (const line of lines) {
    const parsed = parseSubjectRow(line);
    if (!parsed) continue;
    subjects.push(parsed.subject);
    if (parsed.warning) warnings.push(parsed.warning);
  }

  const credits = subjects.filter((s) => ['A', 'B', 'C'].includes(s.grade_normalized)).length;
  const passes = subjects.filter(
    (s) => s.grade_normalized && s.grade_normalized !== 'F',
  ).length;

  if (!candidate.exam_number) warnings.push('low_confidence_field:candidate.exam_number');
  if (!candidate.name) warnings.push('low_confidence_field:candidate.name');
  if (subjects.length === 0) warnings.push('no_subjects_parsed');

  return {
    exam_type: detected,
    exam_body: 'GENERAL CERTIFICATE OF EDUCATION',
    exam_year: extractYear(text),
    exam_diet: null,
    candidate,
    subjects,
    summary: {
      subject_count: subjects.length,
      credits,
      passes,
    },
    warnings,
  };
}
