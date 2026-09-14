const axios = require('axios');
const { notConfigured, normalizeUpstreamError } = require('../errors');

const name = 'http';

/** @type {{ token: string } | null} */
let tokenCache = null;
/** @type {Promise<string> | null} */
let tokenPromise = null;

function getConfig() {
  return {
    baseUrl: (process.env.ATTENDANCE_SERVICE_BASE_URL || '').replace(/\/$/, ''),
    adminSecret: process.env.ATTENDANCE_ADMIN_SECRET || '',
    applicationName: process.env.ATTENDANCE_APPLICATION_NAME || '',
    timeoutMs: Number(process.env.ATTENDANCE_SERVICE_TIMEOUT_MS) || 15000,
  };
}

function assertConfigured() {
  const { baseUrl, adminSecret, applicationName } = getConfig();
  if (!baseUrl || !adminSecret || !applicationName) {
    throw notConfigured('attendance');
  }
  return getConfig();
}

function authClient() {
  const { baseUrl, adminSecret, timeoutMs } = assertConfigured();
  return axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: {
      'x-admin-secret': adminSecret,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

function clearTokenCache() {
  tokenCache = null;
  tokenPromise = null;
}

async function generateAccessToken() {
  const { applicationName } = assertConfigured();
  const http = authClient();
  const res = await http.post('/api/auth/generate-token', { applicationName });
  const token = res.data?.token;
  if (!token) {
    throw new Error('attendance generate-token response missing token');
  }
  tokenCache = { token };
  return token;
}

async function refreshAccessToken() {
  const { applicationName } = assertConfigured();
  const http = authClient();
  const body = { applicationName };
  if (tokenCache?.token) {
    body.token = tokenCache.token;
  }
  const res = await http.post('/api/auth/refresh-token', body, {
    headers: tokenCache?.token
      ? { 'x-app-token': tokenCache.token, 'x-app-name': applicationName }
      : undefined,
  });
  const token = res.data?.token;
  if (!token) {
    throw new Error('attendance refresh-token response missing token');
  }
  tokenCache = { token };
  return token;
}

async function ensureAccessToken({ forceRefresh = false } = {}) {
  assertConfigured();
  if (!forceRefresh && tokenCache?.token) {
    return tokenCache.token;
  }

  if (!tokenPromise) {
    tokenPromise = (async () => {
      try {
        if (forceRefresh && tokenCache?.token) {
          try {
            return await refreshAccessToken();
          } catch {
            clearTokenCache();
            return await generateAccessToken();
          }
        }
        return await generateAccessToken();
      } finally {
        tokenPromise = null;
      }
    })();
  }

  return tokenPromise;
}

async function dataClient() {
  const { baseUrl, applicationName, timeoutMs } = assertConfigured();
  const token = await ensureAccessToken();
  console.info('token', token);
  console.info('baseUrl', baseUrl);
  console.info('applicationName', applicationName);
  console.info('timeoutMs', timeoutMs);
  return axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: {
      'x-app-name': applicationName,
      'x-app-token': token,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

function compactParams(obj = {}) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
}

const IDENTITY_PARAM_KEYS = new Set(['student_id', 'registration_id', 'candidate_code']);

/** Filters only — identity must come from buildUpstreamIdentity, never from callers. */
function filterParams(params = {}) {
  return compactParams(
    Object.fromEntries(Object.entries(params).filter(([k]) => !IDENTITY_PARAM_KEYS.has(k)))
  );
}

/**
 * Build upstream identity query params.
 * Attendance matches on candidate_code alone. Sending CRP registration UUIDs
 * alongside candidate_code makes upstream return 404 ("couldn't find a student").
 */
function buildUpstreamIdentity(studentContext = {}) {
  const candidateCode = studentContext.candidate_code;
  if (candidateCode) {
    return compactParams({
      candidate_code: candidateCode,
      // Only when the client explicitly overrode these for attendance.
      student_id: studentContext.explicit_student_id,
      registration_id: studentContext.explicit_registration_id,
    });
  }
  return compactParams({
    student_id: studentContext.explicit_student_id || studentContext.user_id,
    registration_id: studentContext.explicit_registration_id || studentContext.registration_id,
    candidate_code: studentContext.candidate_code,
  });
}

async function request(method, path, { params, data, studentContext } = {}, { retried = false } = {}) {
  try {
    const http = await dataClient();
    const cleaned = {
      ...buildUpstreamIdentity(studentContext),
      ...filterParams(params),
    };
    const res = await http.request({
      method,
      url: path,
      params: cleaned,
      data,
    });
    return res.data?.data !== undefined ? res.data.data : res.data;
  } catch (err) {
    if (err.details?.error_code === 'provider_not_configured') throw err;

    if (!retried && err?.response?.status === 401) {
      await ensureAccessToken({ forceRefresh: true });
      return request(method, path, { params, data, studentContext }, { retried: true });
    }

    throw normalizeUpstreamError('attendance', err);
  }
}

async function getHomeSummary(studentContext, filters = {}) {
  return request('GET', '/api/students/me/home', { studentContext, params: filters });
}

async function getSummary(studentContext, filters = {}) {
  return request('GET', '/api/students/me/summary', { studentContext, params: filters });
}

async function getClasses(studentContext, filters = {}) {
  return request('GET', '/api/students/me/classes', { studentContext, params: filters });
}

async function getHistory(studentContext, filters = {}) {
  return request('GET', '/api/students/me/history', { studentContext, params: filters });
}

async function getCourseSessions(studentContext, courseCode, filters = {}) {
  const encoded = encodeURIComponent(courseCode);
  return request('GET', `/api/students/me/classes/${encoded}/sessions`, {
    studentContext,
    params: filters,
  });
}

async function getCourses(studentContext, filters = {}) {
  return request('GET', `/api/students/me/courses`, {
    studentContext,
    params: filters,
  });
}

async function getTimetable(studentContext, filters = {}) {
  return request('GET', '/api/students/me/timetable', { studentContext, params: filters });
}

async function checkIn(studentContext, classId, payload = {}) {
  const data = {
    student_id: studentContext?.student_id || payload.student_id,
    registration_id: studentContext?.attendance_registration_code || payload.registration_id,
    lecture_id: classId || payload.lecture_id,
    location: payload.location || (payload.latitude && payload.longitude ? [{
      latitude: String(payload.latitude),
      longitude: String(payload.longitude),
      accuracy: payload.accuracy !== undefined ? String(payload.accuracy) : '0',
      timestamp: payload.timestamp || new Date().toISOString(),
    }] : []),
    ...payload,
  };
  data.student_id = studentContext?.student_id || data.student_id;
  data.registration_id = studentContext?.attendance_registration_code || data.registration_id;
  data.lecture_id = classId || data.lecture_id;

  return request('POST', '/api/students/me/check-in', {
    studentContext,
    data,
  });
}

async function checkOut(studentContext, classId, payload = {}) {
  const data = {
    student_id: studentContext?.student_id || payload.student_id,
    registration_id: studentContext?.attendance_registration_code || payload.registration_id,
    lecture_id: classId || payload.lecture_id,
    location: payload.location || (payload.latitude && payload.longitude ? [{
      latitude: String(payload.latitude),
      longitude: String(payload.longitude),
      accuracy: payload.accuracy !== undefined ? String(payload.accuracy) : '0',
      timestamp: payload.timestamp || new Date().toISOString(),
    }] : []),
    ...payload,
  };
  data.student_id = studentContext?.student_id || data.student_id;
  data.registration_id = studentContext?.attendance_registration_code || data.registration_id;
  data.lecture_id = classId || data.lecture_id;

  return request('POST', '/api/students/me/check-out', {
    studentContext,
    data,
  });
}

async function syncStudents(payload) {
  try {
    console.info('payload', payload);
    return request('POST', '/api/auth/sync-students', { data: payload });
  } catch (error) {
    console.log('payload', payload);
    console.log('error', error.response.data);
    console.error('Error syncing students:', error);
    throw error;
  }
}

async function syncInstitutions(payload) {
  try {
    const data = Array.isArray(payload) ? { institutions: payload } : payload;
    console.info('[AttendanceSync] syncInstitutions payload', data);
    return request('POST', '/api/auth/sync-institutions', { data });
  } catch (error) {
    console.error('[AttendanceSync] Error syncing institutions:', error.message || error);
    if (error.response && error.response.data) {
      console.error('[AttendanceSync] Provider response error body:', error.response.data);
    }
    throw error;
  }
}

module.exports = {
  name,
  getHomeSummary,
  getSummary,
  getClasses,
  getHistory,
  getCourseSessions,
  getCourses,
  getTimetable,
  checkIn,
  checkOut,
  syncStudents,
  syncInstitutions,
  // Test helpers
  _clearTokenCache: clearTokenCache,
  _getTokenCache: () => tokenCache,
  _buildUpstreamIdentity: buildUpstreamIdentity,
};

