const attendanceProviders = require('../modules/integrations/attendance');
const crmsProviders = require('../modules/integrations/crms');
const { notConfigured, normalizeUpstreamError } = require('../modules/integrations/errors');

describe('Attendance / CRMS provider registries', () => {
  const prevAttendance = process.env.ATTENDANCE_PROVIDER;
  const prevCrms = process.env.CRMS_PROVIDER;
  const prevAttUrl = process.env.ATTENDANCE_SERVICE_BASE_URL;
  const prevAttKey = process.env.ATTENDANCE_SERVICE_API_KEY;
  const prevCrmsUrl = process.env.CRMS_SERVICE_BASE_URL;
  const prevCrmsKey = process.env.CRMS_SERVICE_API_KEY;

  afterAll(() => {
    process.env.ATTENDANCE_PROVIDER = prevAttendance;
    process.env.CRMS_PROVIDER = prevCrms;
    process.env.ATTENDANCE_SERVICE_BASE_URL = prevAttUrl;
    process.env.ATTENDANCE_SERVICE_API_KEY = prevAttKey;
    process.env.CRMS_SERVICE_BASE_URL = prevCrmsUrl;
    process.env.CRMS_SERVICE_API_KEY = prevCrmsKey;
  });

  it('defaults to mock providers', () => {
    delete process.env.ATTENDANCE_PROVIDER;
    delete process.env.CRMS_PROVIDER;
    expect(attendanceProviders.resolveName()).toBe('mock');
    expect(crmsProviders.resolveName()).toBe('mock');
    expect(attendanceProviders.get().name).toBe('mock');
    expect(crmsProviders.get().name).toBe('mock');
  });

  it('mock attendance returns home / classes / timetable shapes', async () => {
    process.env.ATTENDANCE_PROVIDER = 'mock';
    const provider = attendanceProviders.get();
    const ctx = {
      user_id: 'u1',
      registration_id: 'r1',
      candidate_code: 'JUPEB/TEST',
    };
    const home = await provider.getHomeSummary(ctx);
    expect(home.attendance_percent).toBe(96);
    expect(Array.isArray(home.todays_classes)).toBe(true);
    expect(home.attendance_chart.labels.length).toBe(5);

    const classes = await provider.getClasses(ctx, { q: 'ELE' });
    expect(classes.length).toBeGreaterThan(0);
    expect(classes[0]).toHaveProperty('course_code');

    const timetable = await provider.getTimetable(ctx, { month: '2026-07' });
    expect(Array.isArray(timetable.marked_dates)).toBe(true);
    expect(timetable.sessions_by_date).toBeTruthy();
  });

  it('mock CRMS returns courses and results shapes', async () => {
    process.env.CRMS_PROVIDER = 'mock';
    const provider = crmsProviders.get();
    const ctx = { user_id: 'u1', registration_id: 'r1' };
    const courses = await provider.getCourses(ctx);
    expect(courses.summary.subjects_count).toBe(3);
    expect(courses.courses[0].subtopics.length).toBeGreaterThan(0);

    const results = await provider.getResults(ctx);
    expect(results.summary.grade_label).toBe('A');
    expect(results.exam_scores.length).toBeGreaterThan(0);
  });

  it('http attendance provider fails with provider_not_configured without env', async () => {
    process.env.ATTENDANCE_PROVIDER = 'http';
    delete process.env.ATTENDANCE_SERVICE_BASE_URL;
    delete process.env.ATTENDANCE_SERVICE_API_KEY;
    const provider = attendanceProviders.get('http');
    await expect(provider.getSummary({ user_id: 'u1', registration_id: 'r1' })).rejects.toMatchObject({
      status: 503,
      details: { error_code: 'provider_not_configured' },
    });
  });

  it('http CRMS provider fails with provider_not_configured without env', async () => {
    process.env.CRMS_PROVIDER = 'http';
    delete process.env.CRMS_SERVICE_BASE_URL;
    delete process.env.CRMS_SERVICE_API_KEY;
    const provider = crmsProviders.get('http');
    await expect(provider.getCourses({ user_id: 'u1', registration_id: 'r1' })).rejects.toMatchObject({
      status: 503,
      details: { error_code: 'provider_not_configured' },
    });
  });

  it('normalizeUpstreamError maps timeouts', () => {
    const err = normalizeUpstreamError('attendance', { code: 'ECONNABORTED', message: 'timeout' });
    expect(err.status).toBe(503);
    expect(err.details.error_code).toBe('provider_unavailable');
  });

  it('notConfigured helper returns 503', () => {
    const err = notConfigured('crms');
    expect(err.status).toBe(503);
    expect(err.details.error_code).toBe('provider_not_configured');
  });
});
