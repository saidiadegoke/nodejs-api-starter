const { parseWaec } = require('../modules/ocr/parsers/waec.parser');
const { normalizeGrade } = require('../modules/ocr/parsers/grade-normalizer');

describe('WAEC OCR Parser & Grade Normalizer', () => {
  it('normalizes A2, A3, B1, etc.', () => {
    expect(normalizeGrade('A2').normalized).toBe('A');
    expect(normalizeGrade('A2').isCredit).toBe(true);
    expect(normalizeGrade('A1').normalized).toBe('A');
    expect(normalizeGrade('C5').normalized).toBe('C');
  });

  it('parses Statement of Result lines with grade A2 and trailing points/remarks', () => {
    const text = `
      OFFICIAL STATEMENT OF RESULT
      CANDIDATE NAME: CHIZOM NATHAN
      EXAMINATION YEAR: 2024
      CANDIDATE NUMBER: 4250101048
      SCHOOL NUMBER: 42501
      DATE OF BIRTH: 15TH MARCH 2006

      SUBJECT GRADE POINTS REMARKS
      English Language A2 6 Credit
      Mathematics C5 4 Credit
      Christian Religious Studies A1 1 Distinction
      Government B2 5 Credit
      Literature-in-English A2 6 Credit
      Fine Art B3 5 Credit
      Yoruba C4 4 Credit
      Economics B2 5 Credit
      French C6 3 Credit
    `;

    const result = parseWaec(text);
    expect(result.candidate.name).toBe('CHIZOM NATHAN');
    expect(result.candidate.exam_number).toBe('4250101048');
    expect(result.exam_year).toBe(2024);
    expect(result.subjects.length).toBe(9);

    const eng = result.subjects.find((s) => s.name === 'ENGLISH LANGUAGE');
    expect(eng).toBeDefined();
    expect(eng.grade).toBe('A2');
    expect(eng.grade_normalized).toBe('A');

    const math = result.subjects.find((s) => s.name === 'MATHEMATICS');
    expect(math).toBeDefined();
    expect(math.grade).toBe('C5');
    expect(math.grade_normalized).toBe('C');
  });
});
