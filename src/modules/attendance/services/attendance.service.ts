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
}
