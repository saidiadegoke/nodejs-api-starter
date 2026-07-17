const name = 'mock';

async function getCourses(_studentContext) {
  return {
    summary: {
      subjects_count: 3,
      subtopics_count: 10,
    },
    courses: [
      {
        id: '44444444-4444-4444-8444-444444444401',
        title: 'Mathematics',
        subtopics: ['Algebra', 'Geometry', 'Calculus basics', 'Statistics intro'],
      },
      {
        id: '44444444-4444-4444-8444-444444444402',
        title: 'English Language',
        subtopics: ['Grammar', 'Comprehension', 'Essay writing'],
      },
      {
        id: '44444444-4444-4444-8444-444444444403',
        title: 'Physics',
        subtopics: ['Mechanics', 'Waves', 'Electricity'],
      },
    ],
  };
}

async function getResults(_studentContext) {
  return {
    summary: {
      grade_label: 'A',
      average_score: 72.5,
      grade_point: 7,
    },
    exam_scores: [
      {
        id: '55555555-5555-4555-8555-555555555501',
        subject: 'MTH101',
        ca: '6/15',
        exam: '80/85',
        total: '86/100',
        grade: 'A',
      },
      {
        id: '55555555-5555-4555-8555-555555555502',
        subject: 'ENG101',
        ca: '10/15',
        exam: '70/85',
        total: '80/100',
        grade: 'B',
      },
      {
        id: '55555555-5555-4555-8555-555555555503',
        subject: 'PHY101',
        ca: '8/15',
        exam: '65/85',
        total: '73/100',
        grade: 'B',
      },
    ],
    download_url: 'https://cdn.example.com/results/transcript.pdf',
    share_url: 'https://portal.example.com/results/share/token',
  };
}

async function getHomeSummary(_studentContext) {
  const results = await getResults(_studentContext);
  const courses = await getCourses(_studentContext);
  return {
    average_score_percent: Math.round(results.summary.average_score),
    subjects_count: courses.summary.subjects_count,
    overall_grade: results.summary.grade_label,
  };
}

module.exports = {
  name,
  getCourses,
  getResults,
  getHomeSummary,
};
