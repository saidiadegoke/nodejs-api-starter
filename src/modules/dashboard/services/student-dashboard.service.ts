import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { StudentDashboardQueryDto, StudentHomeResponseDto } from '../dto';

// Dynamic lazy imports for legacy attendance/crms integrations
let attendanceProviders: any;
let crmsProviders: any;
try {
  attendanceProviders = require('../../integrations/attendance');
  crmsProviders = require('../../integrations/crms');
} catch {
  attendanceProviders = { get: () => ({}) };
  crmsProviders = { get: () => ({}) };
}

@Injectable()
export class StudentDashboardService {
  private readonly logger;

  constructor(
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(StudentDashboardService.name);
  }

  private async resolveStudentContext(userId: string, candidateCode?: string) {
    if (!userId && !candidateCode) {
      throw new UnauthorizedException('Authentication required');
    }

    let reg: any = null;
    if (candidateCode) {
      const rows = await this.dataSource.query(
        `SELECT * FROM jupeb_registrations
         WHERE provisional_candidate_code = $1 OR institution_issued_code = $1 OR jupeb_candidate_number = $1
         ORDER BY created_at DESC LIMIT 1`,
        [candidateCode.trim()],
      );
      reg = rows[0] || null;
      if (!reg) {
        throw new NotFoundException(`No registration found for candidate code: ${candidateCode}`);
      }
    } else {
      const rows = await this.dataSource.query(
        `SELECT * FROM jupeb_registrations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      reg = rows[0] || null;
      if (!reg) {
        throw new NotFoundException('No registration found for current user');
      }
    }

    return {
      registration_id: reg.id,
      user_id: reg.user_id || userId,
      session_id: reg.session_id,
      university_id: reg.university_id,
      candidate_code:
        reg.jupeb_candidate_number ||
        reg.provisional_candidate_code ||
        reg.institution_issued_code ||
        null,
      attendance_registration_code: reg.attendance_registration_code || null,
      student_id: reg.attendance_student_id || null,
      is_result_released: Boolean(reg.is_result_released),
    };
  }

  async getHome(userId: string, query: StudentDashboardQueryDto = {}): Promise<StudentHomeResponseDto> {
    const candidateCode = query.candidate_code;
    const ctx = await this.resolveStudentContext(userId, candidateCode);

    let attObj: any = {};
    let classes: any[] = [];
    let attChart: any = null;

    try {
      const attendance = attendanceProviders?.get ? attendanceProviders.get() : null;
      if (attendance && typeof attendance.getHomeSummary === 'function') {
        const filters: any = {};
        if (query.q) filters.q = query.q;
        if (query.month) filters.month = query.month;
        const attHome = await attendance.getHomeSummary(ctx, filters);
        if (Array.isArray(attHome)) {
          classes = attHome;
        } else if (attHome && typeof attHome === 'object') {
          attObj = attHome;
          classes = attHome.todays_classes || attHome.classes || [];
          attChart = attHome.attendance_chart || null;
        }
      }
    } catch (err: any) {
      this.logger.warn(`Attendance provider getHomeSummary failed: ${err.message}`);
    }

    let crmsHome: any = {};
    try {
      const crms = crmsProviders?.get ? crmsProviders.get() : null;
      if (crms && typeof crms.getHomeSummary === 'function') {
        crmsHome = await crms.getHomeSummary(ctx);
      }
    } catch (err: any) {
      this.logger.warn(`CRMS provider getHomeSummary failed: ${err.message}`);
    }

    let unreadCount = 0;
    try {
      const unreadRows = await this.dataSource.query(
        `SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
        [ctx.user_id || userId],
      );
      unreadCount = Number(unreadRows[0]?.c) || 0;
    } catch {
      unreadCount = 0;
    }

    return {
      summary: {
        attendance_percent: Number(attObj.attendance_percent) || 0,
        average_score_percent: Number(crmsHome.average_score_percent) || 0,
        subjects_count: Number(crmsHome.subjects_count) || 0,
        overall_grade: crmsHome.overall_grade || null,
      },
      todays_classes: classes,
      attendance_chart: attChart,
      unread_notifications_count: unreadCount,
    };
  }

  async getCourses(userId: string) {
    const ctx = await this.resolveStudentContext(userId);
    const attendance = attendanceProviders?.get ? attendanceProviders.get() : null;
    if (attendance && typeof attendance.getCourses === 'function') {
      return attendance.getCourses(ctx);
    }
    return [];
  }

  async getResults(userId: string) {
    const ctx = await this.resolveStudentContext(userId);
    if (!ctx.is_result_released) {
      throw new ForbiddenException('Results have not been released for your registration yet');
    }
    const crms = crmsProviders?.get ? crmsProviders.get() : null;
    if (crms && typeof crms.getResults === 'function') {
      return crms.getResults(ctx);
    }
    return null;
  }

  async checkIn(userId: string, classId: string, payload: any = {}) {
    const ctx = await this.resolveStudentContext(userId);
    const attendance = attendanceProviders?.get ? attendanceProviders.get() : null;
    if (attendance && typeof attendance.checkIn === 'function') {
      return attendance.checkIn(ctx, classId, payload);
    }
    return { success: true, message: 'Checked in' };
  }

  async checkOut(userId: string, classId: string, payload: any = {}) {
    const ctx = await this.resolveStudentContext(userId);
    const attendance = attendanceProviders?.get ? attendanceProviders.get() : null;
    if (attendance && typeof attendance.checkOut === 'function') {
      return attendance.checkOut(ctx, classId, payload);
    }
    return { success: true, message: 'Checked out' };
  }
}
