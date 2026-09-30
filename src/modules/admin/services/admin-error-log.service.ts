import { Injectable, NotFoundException } from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { AdminRepository } from '../repositories/admin.repository';
import {
  ListErrorLogsQueryDto,
  ErrorLogStatsResponseDto,
  ListErrorLogsResponseDto,
  RequestLogItemDto,
} from '../dto';

@Injectable()
export class AdminErrorLogService {
  private readonly logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(AdminErrorLogService.name);
  }

  async getStats(): Promise<ErrorLogStatsResponseDto> {
    return this.adminRepo.getErrorStats();
  }

  async list(query: ListErrorLogsQueryDto): Promise<ListErrorLogsResponseDto> {
    const res = await this.adminRepo.listErrorLogs(query);
    return {
      entries: res.entries.map((e) => ({
        id: e.id,
        method: e.method,
        path: e.path,
        status_code: e.statusCode,
        duration_ms: e.durationMs,
        request_id: e.requestId || null,
        user_id: e.userId || null,
        ip_address: e.ipAddress || null,
        error_message: e.errorMessage || null,
        created_at: e.createdAt,
      })),
      total: res.total,
    };
  }

  async getById(id: string): Promise<RequestLogItemDto> {
    const log = await this.adminRepo.getErrorLogById(id);
    if (!log) throw new NotFoundException('Log entry not found');

    return {
      id: log.id,
      method: log.method,
      path: log.path,
      status_code: log.statusCode,
      duration_ms: log.durationMs,
      request_id: log.requestId || null,
      user_id: log.userId || null,
      ip_address: log.ipAddress || null,
      error_message: log.errorMessage || null,
      created_at: log.createdAt,
    };
  }
}
