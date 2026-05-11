const { parseWaec } = require('./waec.parser');
const { parseNeco } = require('./neco.parser');
const { parseGce } = require('./gce.parser');
const { parseGeneric } = require('./generic.parser');
const { classifyExamType } = require('../utils/classify-exam-type');

/**
 * Dispatch to the right parser for an exam type.
 *
 *   parseResult({ text, examType: 'auto' })
 *   parseResult({ text, examType: 'waec' })
 *
 * Returns { result_json, exam_type_detected }.
 */
function parseResult({ text, examType = 'auto' }) {
  const detected = examType === 'auto' ? classifyExamType(text) : examType;

  let result;
  switch (detected) {
    case 'waec':
      result = parseWaec(text, { detected });
      break;
    case 'neco':
      result = parseNeco(text, { detected });
      break;
    case 'nabteb':
      // NABTEB shares the WAEC-like grade scheme; reuse the WAEC parser
      // and override the body / detected field.
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

module.exports = { parseResult, classifyExamType };
