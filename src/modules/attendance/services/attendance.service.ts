import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolveStudentContext } from '../../../integrations/student-context';
import * as attendanceProvider from '../../../integrations/attendance';

export function extractCandidateCode(filters: any): string | null {
  if (!filters || typeof filters !== 'object') return null;
  const raw =
    filters.candidate_code ??
    filters.candidate_number ??
    filters.candidateCode ??
    filters.candidateNumber ??
    filters.candidate_reg_number ??
    filters.registration_number;
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

const CANDIDATE_FILTER_KEYS = new Set([
  'candidate_code',
  'candidate_number',
  'candidateCode',
  'candidateNumber',
  'candidate_reg_number',
  'registration_number',
]);

export function cleanAttendanceFilters(filters: any): Record<string, any> {
  if (!filters || typeof filters !== 'object') return {};
  return Object.fromEntries(
    Object.entries(filters).filter(([k]) => !CANDIDATE_FILTER_KEYS.has(k)),
  );
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  static async resolveStudentContextForAttendance(
    userOrId: string | any,
    filters: any = {},
    dataSource?: DataSource,
  ) {
    const userId = typeof userOrId === 'string' ? userOrId : userOrId?.user_id;
    const candidateCode = extractCandidateCode(filters);
    const cleanedFilters = cleanAttendanceFilters(filters);

    if (candidateCode) {
      const registrationModel = require('../../jupeb/models/registration.model');
      const rbacMiddleware = require('../../../utils/middleware/rbac.middleware');
      const institutionScope = require('../../jupeb/utils/institution-scope');

      const reg = await registrationModel.findByCandidateCode(candidateCode);
      if (!reg) {
        const err: any = new Error('Registration not found');
        err.status = 404;
        err.statusCode = 404;
        err.details = { error_code: 'registration_not_found' };
        throw err;
      }

      const roles =
        Array.isArray(userOrId?.roles) && userOrId.roles.length > 0
          ? userOrId.roles
          : await rbacMiddleware.getUserRoles(userId);
      const isStudent = roles.includes('student');
      const isAdminOrInst =
        roles.includes('admin') ||
        roles.includes('super_admin') ||
        roles.includes('institution_admin');

      if (isStudent && reg.user_id !== userId) {
        const err: any = new Error('Unauthorized candidate access');
        err.status = 403;
        err.statusCode = 403;
        err.details = { error_code: 'unauthorized_candidate_access' };
        throw err;
      }

      if (!isStudent && !isAdminOrInst) {
        await institutionScope.assertInstitutionUniversityAccess(userId, reg.university_id);
      }

      const studentContext = {
        candidate_code: filters.candidate_code || reg.jupeb_candidate_number || candidateCode,
        candidate_number: filters.candidate_number || reg.jupeb_candidate_number || candidateCode,
        registration_id: reg.id,
        user_id: reg.user_id || userId,
        university_id: reg.university_id,
        session_id: reg.session_id,
        attendance_registration_code: reg.attendance_registration_code || null,
        student_id: reg.attendance_student_id || null,
        is_result_released: Boolean(reg.is_result_released),
      };

      return { studentContext, cleanedFilters };
    }

    const ds = dataSource || require('../../../database/pool');
    const studentContext = await resolveStudentContext(ds, userId, filters);
    return { studentContext, cleanedFilters };
  }

  async getHome(userOrId: string | any, filters: any = {}) {
    return AttendanceService.getHome(userOrId, filters, this.dataSource);
  }

  async getSummary(userOrId: string | any, filters: any = {}) {
    return AttendanceService.getSummary(userOrId, filters, this.dataSource);
  }

  async getClasses(userOrId: string | any, filters: any = {}) {
    return AttendanceService.getClasses(userOrId, filters, this.dataSource);
  }

  async getHistory(userOrId: string | any, filters: any = {}) {
    return AttendanceService.getHistory(userOrId, filters, this.dataSource);
  }

  async getCourseSessions(userOrId: string | any, courseCode: string, filters: any = {}) {
    return AttendanceService.getCourseSessions(userOrId, courseCode, filters, this.dataSource);
  }

  async getTimetable(userOrId: string | any, filters: any = {}) {
    return AttendanceService.getTimetable(userOrId, filters, this.dataSource);
  }

  async checkIn(userOrId: string | any, classId: string, payload: any = {}) {
    return AttendanceService.checkIn(userOrId, classId, payload, this.dataSource);
  }

  async checkOut(userOrId: string | any, classId: string, payload: any = {}) {
    return AttendanceService.checkOut(userOrId, classId, payload, this.dataSource);
  }

  static async syncInstitutions(payload: any) {
    const provider = attendanceProvider.get();
    return provider.syncInstitutions(payload);
  }

  static async syncStudents(payload: any) {
    const provider = attendanceProvider.get();
    return provider.syncStudents(payload);
  }

  static async getHome(userOrId: string | any, filters: any = {}, dataSource?: DataSource) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, filters, dataSource);
    const provider = attendanceProvider.get();
    return provider.getHomeSummary(studentContext, cleanedFilters);
  }

  static async getSummary(userOrId: string | any, filters: any = {}, dataSource?: DataSource) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, filters, dataSource);
    const provider = attendanceProvider.get();
    return provider.getSummary(studentContext, cleanedFilters);
  }

  static async getClasses(userOrId: string | any, filters: any = {}, dataSource?: DataSource) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, filters, dataSource);
    const provider = attendanceProvider.get();
    return provider.getClasses(studentContext, cleanedFilters);
  }

  static async getHistory(userOrId: string | any, filters: any = {}, dataSource?: DataSource) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, filters, dataSource);
    const provider = attendanceProvider.get();
    return provider.getHistory(studentContext, cleanedFilters);
  }

  static async getCourseSessions(
    userOrId: string | any,
    courseCode: string,
    filters: any = {},
    dataSource?: DataSource,
  ) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, filters, dataSource);
    const provider = attendanceProvider.get();
    return provider.getCourseSessions(studentContext, courseCode, cleanedFilters);
  }

  static async getTimetable(userOrId: string | any, filters: any = {}, dataSource?: DataSource) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, filters, dataSource);
    const provider = attendanceProvider.get();
    return provider.getTimetable(studentContext, cleanedFilters);
  }

  static async checkIn(
    userOrId: string | any,
    classId: string,
    payload: any = {},
    dataSource?: DataSource,
  ) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, payload, dataSource);
    const provider = attendanceProvider.get();
    return provider.checkIn(studentContext, classId, { ...cleanedFilters, ...payload });
  }

  static async checkOut(
    userOrId: string | any,
    classId: string,
    payload: any = {},
    dataSource?: DataSource,
  ) {
    const { studentContext, cleanedFilters } =
      await AttendanceService.resolveStudentContextForAttendance(userOrId, payload, dataSource);
    const provider = attendanceProvider.get();
    return provider.checkOut(studentContext, classId, { ...cleanedFilters, ...payload });
  }
}
