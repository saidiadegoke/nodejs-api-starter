const axios = require('axios');
const { notConfigured, normalizeUpstreamError } = require('../errors');

const name = 'http';

function getConfig() {
  return {
    baseUrl: (process.env.CRMS_SERVICE_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.CRMS_SERVICE_API_KEY || '',
    timeoutMs: Number(process.env.CRMS_SERVICE_TIMEOUT_MS) || 15000,
  };
}

function client() {
  const { baseUrl, apiKey, timeoutMs } = getConfig();
  if (!baseUrl || !apiKey) {
    throw notConfigured('crms');
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
    throw normalizeUpstreamError('crms', err);
  }
}

async function getCourses(studentContext) {
  return request('GET', '/v1/students/me/courses', { studentContext });
}

async function getResults(studentContext) {
  return request('GET', '/v1/students/me/results', { studentContext });
}

async function getHomeSummary(studentContext) {
  return request('GET', '/v1/students/me/home-summary', { studentContext });
}

module.exports = {
  name,
  getCourses,
  getResults,
  getHomeSummary,
};
