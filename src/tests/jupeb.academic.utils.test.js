const {
  gradeToPlusOneAwarded,
  aggregateScoresFromResults,
  isValidGrade,
} = require('../modules/jupeb/utils/academic-scoring');

describe('JUPEB academic scoring', () => {
  it('gradeToPlusOneAwarded follows A–E vs F', () => {
    expect(gradeToPlusOneAwarded('A')).toBe(true);
    expect(gradeToPlusOneAwarded('e')).toBe(true);
    expect(gradeToPlusOneAwarded('F')).toBe(false);
    expect(isValidGrade('G')).toBe(false);
  });

  it('aggregateScoresFromResults counts passes and failures', () => {
    const agg = aggregateScoresFromResults([
      { grade: 'A' },
      { grade: 'B' },
      { grade: 'F' },
    ]);
    expect(agg.passed_courses_count).toBe(2);
    expect(agg.failed_courses_count).toBe(1);
    expect(agg.plus_one_total).toBe(2);
  });
});
