import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { resolveStudentContext } from '../../../integrations/student-context';
import * as attendanceProvider from '../../../integrations/attendance';

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getHome(userId: string, filters: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.getHomeSummary(ctx, filters);
  }

  async getSummary(userId: string, filters: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.getSummary(ctx, filters);
  }

  async getClasses(userId: string, filters: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.getClasses(ctx, filters);
  }

  async getHistory(userId: string, filters: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.getHistory(ctx, filters);
  }

  async getCourseSessions(userId: string, courseCode: string, filters: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.getCourseSessions(ctx, courseCode, filters);
  }

  async getTimetable(userId: string, filters: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.getTimetable(ctx, filters);
  }

  async checkIn(userId: string, classId: string, payload: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.checkIn(ctx, classId, payload);
  }

  async checkOut(userId: string, classId: string, payload: any = {}) {
    const ctx = await resolveStudentContext(this.dataSource, userId);
    const provider = attendanceProvider.get();
    return provider.checkOut(ctx, classId, payload);
  }

  static async syncInstitutions(payload: any) {
    const provider = attendanceProvider.get();
    return provider.syncInstitutions(payload);
  }

  static async syncStudents(payload: any) {
    const provider = attendanceProvider.get();
    return provider.syncStudents(payload);
  }

  static async getSummary(userId: string, filters: any = {}) {
    if (filters && filters.candidate_code) {
      const registrationModel = require('../../jupeb/models/registration.model');
      const rbacMiddleware = require('../../../utils/middleware/rbac.middleware');
      const institutionScope = require('../../jupeb/utils/institution-scope');

      const reg = await registrationModel.findByCandidateCode(filters.candidate_code);
      if (!reg) {
        const err: any = new Error('Registration not found');
        err.status = 404;
        err.statusCode = 404;
        err.details = { error_code: 'registration_not_found' };
        throw err;
      }

      const roles = await rbacMiddleware.getUserRoles(userId);
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
        candidate_code: filters.candidate_code,
        registration_id: reg.id,
        user_id: reg.user_id,
        university_id: reg.university_id,
      };

      const provider = attendanceProvider.get();
      return provider.getSummary(studentContext, {});
    }

    const provider = attendanceProvider.get();
    return provider.getSummary({ user_id: userId, ...filters }, filters);
  }
}
