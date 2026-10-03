import axios, { AxiosInstance } from 'axios';
import { notConfigured, normalizeUpstreamError } from '../errors';

export const name = 'http';

let tokenCache: { token: string } | null = null;
let tokenPromise: Promise<string> | null = null;

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

function authClient(): AxiosInstance {
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

export function clearTokenCache() {
  tokenCache = null;
  tokenPromise = null;
}
export const _clearTokenCache = clearTokenCache;

export async function generateAccessToken(): Promise<string> {
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

export async function refreshAccessToken(): Promise<string> {
  const { applicationName } = assertConfigured();
  const http = authClient();
  const body: any = { applicationName };
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

export async function ensureAccessToken({ forceRefresh = false }: { forceRefresh?: boolean } = {}): Promise<string> {
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

async function dataClient(): Promise<AxiosInstance> {
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

function compactParams(obj: Record<string, any> = {}): Record<string, any> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

const IDENTITY_PARAM_KEYS = new Set(['student_id', 'registration_id', 'candidate_code']);

function filterParams(params: Record<string, any> = {}): Record<string, any> {
  return compactParams(
    Object.fromEntries(Object.entries(params).filter(([k]) => !IDENTITY_PARAM_KEYS.has(k))),
  );
}

export function buildUpstreamIdentity(studentContext: Record<string, any> = {}): Record<string, any> {
  const candidateCode = studentContext.candidate_code;
  if (candidateCode) {
    return compactParams({
      candidate_code: candidateCode,
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

async function request(method: string, path: string, { params, data, studentContext }: { params?: any; data?: any; studentContext?: any } = {}, { retried = false } = {}): Promise<any> {
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
  } catch (err: any) {
    if (err?.details?.error_code === 'provider_not_configured') throw err;

    if (!retried && err?.response?.status === 401) {
      await ensureAccessToken({ forceRefresh: true });
      return request(method, path, { params, data, studentContext }, { retried: true });
    }

    throw normalizeUpstreamError('attendance', err);
  }
}

export async function getHomeSummary(studentContext: any, filters = {}) {
  return request('GET', '/api/students/me/home', { studentContext, params: filters });
}

export async function getSummary(studentContext: any, filters = {}) {
  return request('GET', '/api/students/me/summary', { studentContext, params: filters });
}

export async function getClasses(studentContext: any, filters = {}) {
  return request('GET', '/api/students/me/classes', { studentContext, params: filters });
}

export async function getHistory(studentContext: any, filters = {}) {
  return request('GET', '/api/students/me/history', { studentContext, params: filters });
}

export async function getCourseSessions(studentContext: any, courseCode: string, filters = {}) {
  const encoded = encodeURIComponent(courseCode);
  return request('GET', `/api/students/me/classes/${encoded}/sessions`, {
    studentContext,
    params: filters,
  });
}

export async function getCourses(studentContext: any, filters = {}) {
  return request('GET', `/api/students/me/courses`, {
    studentContext,
    params: filters,
  });
}

export async function getTimetable(studentContext: any, filters = {}) {
  return request('GET', '/api/students/me/timetable', { studentContext, params: filters });
}

export async function checkIn(studentContext: any, classId: string, payload: any = {}) {
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

export async function checkOut(studentContext: any, classId: string, payload: any = {}) {
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

export async function syncStudents(payload: any) {
  return request('POST', '/api/auth/sync-students', { data: payload });
}

export async function syncInstitutions(payload: any) {
  const data = Array.isArray(payload) ? { institutions: payload } : payload;
  return request('POST', '/api/auth/sync-institutions', { data });
}

export async function syncSubjects(payload: any) {
  let subjects = Array.isArray(payload) ? payload : payload?.subjects;
  if (Array.isArray(subjects)) {
    subjects = subjects.map((s: any) => ({
      subjectCode: s.subjectCode || s.code,
      subjectName: s.subjectName || s.name,
    }));
  }
  const data = { subjects: subjects || [] };
  return request('POST', '/api/auth/sync-subjects', { data });
}

