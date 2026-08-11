const name = 'mock';

const MOCK_CLASSES = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    course_code: 'ELE 201',
    course_title: 'Electrical Science Studies',
    room: 'Room 101',
    date_label: 'Mon, Jul 13',
    time_range: '09:30 - 11:00',
    status: 'ongoing',
    action: 'mark_attendance',
    action_disabled: false,
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    course_code: 'ELE 321',
    course_title: 'Circuit Theory',
    room: 'Room 204',
    date_label: 'Mon, Jul 13',
    time_range: '11:00 - 12:30',
    status: 'upcoming',
    action: 'preview',
    action_disabled: false,
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    course_code: 'MTH 101',
    course_title: 'Mathematics',
    room: 'Angola Hall',
    date_label: 'Tue, Jul 14',
    time_range: '09:00 - 11:30',
    status: 'completed',
    action: 'preview',
    action_disabled: true,
  },
];

const MOCK_HISTORY = [
  {
    id: '22222222-2222-4222-8222-222222222201',
    course_code: 'ELE 202',
    course_title: 'Electrical science studies',
    attended_count: 10,
    attendance_percent: 34,
  },
  {
    id: '22222222-2222-4222-8222-222222222202',
    course_code: 'ELE 201',
    course_title: 'Electrical Science Studies',
    attended_count: 14,
    attendance_percent: 96,
  },
  {
    id: '22222222-2222-4222-8222-222222222203',
    course_code: 'MTH 101',
    course_title: 'Mathematics',
    attended_count: 12,
    attendance_percent: 80,
  },
];

const MOCK_SESSIONS = {
  'ELE 202': [
    {
      id: '33333333-3333-4333-8333-333333333301',
      course_code: 'ELE 202',
      location: 'Angola Hall',
      date_label: 'Sun, Feb 22',
      time_range: '09:00 - 11:30',
      checked_in_at: '2026-02-22T15:03:00Z',
      checked_out_at: '2026-02-22T17:03:00Z',
    },
    {
      id: '33333333-3333-4333-8333-333333333302',
      course_code: 'ELE 202',
      location: 'Room 101',
      date_label: 'Wed, Feb 25',
      time_range: '09:00 - 11:30',
      checked_in_at: '2026-02-25T09:05:00Z',
      checked_out_at: '2026-02-25T11:20:00Z',
    },
  ],
  'ELE 201': [
    {
      id: '33333333-3333-4333-8333-333333333303',
      course_code: 'ELE 201',
      location: 'Room 101',
      date_label: 'Mon, Jul 13',
      time_range: '09:30 - 11:00',
      checked_in_at: '2026-07-13T09:32:00Z',
      checked_out_at: null,
    },
  ],
  'MTH 101': [
    {
      id: '33333333-3333-4333-8333-333333333304',
      course_code: 'MTH 101',
      location: 'Angola Hall',
      date_label: 'Tue, Jul 14',
      time_range: '09:00 - 11:30',
      checked_in_at: '2026-07-14T09:02:00Z',
      checked_out_at: '2026-07-14T11:25:00Z',
    },
  ],
};

function matchesQuery(haystack, q) {
  if (!q) return true;
  return String(haystack || '').toLowerCase().includes(String(q).toLowerCase());
}

async function getHomeSummary(_studentContext) {
  return {
    attendance_percent: 96,
    todays_classes: MOCK_CLASSES.filter((c) => c.status !== 'completed').map((c) => ({
      id: c.id,
      course_code: c.course_code,
      status: c.status,
      time_range: c.time_range,
      venue: c.room,
      action: c.action,
      action_disabled: c.action_disabled,
    })),
    attendance_chart: {
      headline_percent: 80,
      caption: 'Average attendance over the week',
      labels: ['Mon', 'Tue', 'Wed', 'Thurs', 'Fri'],
      series_primary: [42, 48, 78, 85, 75],
      series_secondary: [25, 63, 28, 48, 95],
    },
  };
}

async function getSummary(_studentContext) {
  return {
    total_marked: 14,
    attendance_ratio_percent: 96,
    analytics: {
      attended_percent: 75,
      missed_percent: 25,
    },
  };
}

async function getClasses(_studentContext, { q } = {}) {
  return MOCK_CLASSES.filter((c) => matchesQuery(c.course_code, q) || matchesQuery(c.course_title, q)).map(
    ({ id, course_code, course_title, room, date_label, time_range }) => ({
      id,
      course_code,
      course_title,
      room,
      date_label,
      time_range,
    })
  );
}

async function getHistory(_studentContext, { q } = {}) {
  return MOCK_HISTORY.filter(
    (h) => matchesQuery(h.course_code, q) || matchesQuery(h.course_title, q)
  );
}

async function getCourseSessions(_studentContext, courseCode, { q } = {}) {
  const key = Object.keys(MOCK_SESSIONS).find(
    (k) => k.toLowerCase() === String(courseCode || '').toLowerCase()
  );
  const sessions = key ? MOCK_SESSIONS[key] : [];
  return sessions.filter(
    (s) =>
      matchesQuery(s.course_code, q) ||
      matchesQuery(s.location, q) ||
      matchesQuery(s.date_label, q)
  );
}

async function getTimetable(_studentContext, { month } = {}) {
  const now = new Date();
  const ym =
    month && /^\d{4}-\d{2}$/.test(month)
      ? month
      : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = ym.split('-').map(Number);
  const d1 = `${ym}-13`;
  const d2 = `${ym}-14`;
  const d3 = `${year}-${String(mon).padStart(2, '0')}-27`;

  return {
    marked_dates: [d1, d2, d3],
    sessions_by_date: {
      [d1]: [
        {
          id: MOCK_CLASSES[0].id,
          course_code: 'ELE 201',
          time_range: '09:30 - 11:00',
          room: 'Room 101',
        },
      ],
      [d2]: [
        {
          id: MOCK_CLASSES[2].id,
          course_code: 'MTH 101',
          time_range: '09:00 - 11:30',
          room: 'Angola Hall',
        },
      ],
      [d3]: [
        {
          id: '11111111-1111-4111-8111-111111111199',
          course_code: 'ELE 202',
          time_range: '09:00 - 11:30',
          room: 'Room 101',
        },
      ],
    },
  };
}

async function checkIn(_studentContext, classId, _payload) {
  return { checked_in_at: new Date().toISOString() };
}

async function checkOut(_studentContext, classId, _payload) {
  return { checked_out_at: new Date().toISOString() };
}

module.exports = {
  name,
  getHomeSummary,
  getSummary,
  getClasses,
  getHistory,
  getCourseSessions,
  getTimetable,
  checkIn,
  checkOut,
};
