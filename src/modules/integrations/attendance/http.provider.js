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

async function request(method, path, { params, data, studentContext } = {}, { retried = false } = {}) {
  try {
    const http = await dataClient();
    const res = await http.request({
      method,
      url: path,
      params: {
        ...params,
        student_id: studentContext.user_id,
        registration_id: studentContext.registration_id,
        candidate_code: studentContext.candidate_code,
      },
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

async function getHomeSummary(studentContext) {
  return request('GET', '/api/students/me/home', { studentContext });
}

async function getSummary(studentContext) {
  return request('GET', '/api/students/me/summary', { studentContext });
}

async function getClasses(studentContext, { q } = {}) {
  const data = await request('GET', '/api/students/me/classes', { studentContext, params: { q } });
  // eslint-disable-next-line no-console
  console.log('[attendance.http] getClasses', {
    student_id: studentContext.user_id,
    registration_id: studentContext.registration_id,
    q: q || null,
    data,
  });
  return data;
}

async function getHistory(studentContext, { q } = {}) {
  return request('GET', '/api/students/me/history', { studentContext, params: { q } });
}

async function getCourseSessions(studentContext, courseCode, { q } = {}) {
  const encoded = encodeURIComponent(courseCode);
  return request('GET', `/api/students/me/classes/${encoded}/sessions`, {
    studentContext,
    params: { q },
  });
}

async function getTimetable(studentContext, { month } = {}) {
  return request('GET', '/api/students/me/timetable', {
    studentContext,
    params: { month },
  });
}

async function checkIn(studentContext, classId, payload) {
  return request('POST', `/api/students/me/classes/${encodeURIComponent(classId)}/check-in`, {
    studentContext,
    data: payload,
  });
}

async function checkOut(studentContext, classId, payload) {
  return request('POST', `/api/students/me/classes/${encodeURIComponent(classId)}/check-out`, {
    studentContext,
    data: payload,
  });
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
  // Test helpers
  _clearTokenCache: clearTokenCache,
  _getTokenCache: () => tokenCache,
};
