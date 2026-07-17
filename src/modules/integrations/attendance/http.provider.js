const axios = require('axios');
const { notConfigured, normalizeUpstreamError } = require('../errors');

const name = 'http';

function getConfig() {
  return {
    baseUrl: (process.env.ATTENDANCE_SERVICE_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.ATTENDANCE_SERVICE_API_KEY || '',
    timeoutMs: Number(process.env.ATTENDANCE_SERVICE_TIMEOUT_MS) || 15000,
  };
}

function client() {
  const { baseUrl, apiKey, timeoutMs } = getConfig();
  if (!baseUrl || !apiKey) {
    throw notConfigured('attendance');
  }
  return axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

async function request(method, path, { params, studentContext } = {}) {
  try {
    const http = client();
    const res = await http.request({
      method,
      url: path,
      params: {
        ...params,
        student_id: studentContext.user_id,
        registration_id: studentContext.registration_id,
        candidate_code: studentContext.candidate_code,
      },
    });
    return res.data?.data !== undefined ? res.data.data : res.data;
  } catch (err) {
    if (err.details?.error_code === 'provider_not_configured') throw err;
    throw normalizeUpstreamError('attendance', err);
  }
}

async function getHomeSummary(studentContext) {
  return request('GET', '/v1/students/me/home', { studentContext });
}

async function getSummary(studentContext) {
  return request('GET', '/v1/students/me/summary', { studentContext });
}

async function getClasses(studentContext, { q } = {}) {
  return request('GET', '/v1/students/me/classes', { studentContext, params: { q } });
}

async function getHistory(studentContext, { q } = {}) {
  return request('GET', '/v1/students/me/history', { studentContext, params: { q } });
}

async function getCourseSessions(studentContext, courseCode, { q } = {}) {
  const encoded = encodeURIComponent(courseCode);
  return request('GET', `/v1/students/me/classes/${encoded}/sessions`, {
    studentContext,
    params: { q },
  });
}

async function getTimetable(studentContext, { month } = {}) {
  return request('GET', '/v1/students/me/timetable', {
    studentContext,
    params: { month },
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
};
