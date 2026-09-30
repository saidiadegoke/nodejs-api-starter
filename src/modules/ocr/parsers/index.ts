import { parseWaec } from './waec.parser';
import { parseNeco } from './neco.parser';
import { parseGce } from './gce.parser';
import { parseGeneric } from './generic.parser';
import { classifyExamType } from '../utils/classify-exam-type';

export interface ParseResultOptions {
  text: string;
  examType?: string;
}

export function parseResult({ text, examType = 'auto' }: ParseResultOptions) {
  const detected = examType === 'auto' ? classifyExamType(text) : examType;

  let result: any;
  switch (detected) {
    case 'waec':
      result = parseWaec(text, { detected });
      break;
    case 'neco':
      result = parseNeco(text, { detected });
      break;
    case 'nabteb':
      result = parseWaec(text, { detected: 'nabteb' });
      result.exam_body = 'NATIONAL BUSINESS AND TECHNICAL EXAMINATIONS BOARD';
      break;
    case 'gce':
      result = parseGce(text, { detected });
      break;
    case 'generic':
    default:
      result = parseGeneric(text, { detected: 'generic' });
      break;
  }

  return { result_json: result, exam_type_detected: result.exam_type };
}

export { classifyExamType, parseWaec, parseNeco, parseGce, parseGeneric };
