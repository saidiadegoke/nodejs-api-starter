import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SubjectRepository } from '../repositories/subject.repository';
import { SubjectEntity } from '../entities/subject.entity';
import { CreateSubjectDto, PatchSubjectDto, ListSubjectsQueryDto } from '../dtos/subject.dto';
import { CommodLogger, LoggerFactory } from '../../../logger';

function parseCsv(text: string): Record<string, string>[] {
  if (!text || !String(text).trim()) return [];
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^['’`"]+/, '').trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i] || '';
    });
    return obj;
  });
}

import { EventEmitter2 } from '@nestjs/event-emitter';
import { SubjectSyncQueueService } from '../../sync/services/subject-sync-queue.service';
import { SyncEvent } from '../../sync/constants/sync-events.enum';

@Injectable()
export class SubjectsService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly subjectRepo: SubjectRepository,
    private readonly subjectSyncQueueService: SubjectSyncQueueService,
    private readonly eventEmitter: EventEmitter2,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(SubjectsService.name);
  }

  async listPublic(): Promise<SubjectEntity[]> {
    return this.subjectRepo.findPublicActive();
  }

  async listAdmin(
    query: ListSubjectsQueryDto,
    userId?: string,
  ): Promise<{ rows: any[]; page: number; limit: number; total: number }> {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const [rows, total] = await this.subjectRepo.findAllAdmin({
      limit: safeLimit,
      offset,
      status: query.status,
      q: query.q,
    });

    let effectiveSessionId = query.session_id || null;
    if (!effectiveSessionId && userId) {
      try {
        const { resolveEffectiveSession } = require('../../jupeb/services/session-context.service');
        const session = await resolveEffectiveSession(userId, null);
        effectiveSessionId = session?.id || null;
      } catch {
        // Fallback
      }
    }

    const enrolledMap = await this.subjectRepo.enrolledCountsForSubjects(
      rows.map((r) => r.id),
      effectiveSessionId,
    );

    const enriched = rows.map((row) => ({
      ...row,
      enrolled_count: enrolledMap.get(row.id) || 0,
    }));

    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async getById(id: string): Promise<SubjectEntity> {
    if (!id) throw new UnprocessableEntityException('Invalid subject id');
    const row = await this.subjectRepo.findById(id);
    if (!row) throw new NotFoundException('Subject not found');
    return row;
  }

  async create(dto: CreateSubjectDto): Promise<SubjectEntity> {
    const code = String(dto.code || '').trim();
    const name = String(dto.name || '').trim();
    if (!code || !name) {
      throw new UnprocessableEntityException('code and name are required');
    }
    if (code.length > 20) {
      throw new UnprocessableEntityException('code must be 20 characters or less');
    }

    const existing = await this.subjectRepo.findByCode(code);
    if (existing) {
      throw new ConflictException({
        message: 'Subject with this code already exists',
        details: { field: 'code', value: code },
      });
    }

    const created = await this.subjectRepo.create({
      code,
      name,
      description: dto.description || null,
      status: 'active',
    });

    this.subjectSyncQueueService.enqueueSubjectSyncJob({
      subjectIds: [created.id],
      triggeredBy: 'subject_created',
    }).catch((err) => this.logger.error(`Failed to enqueue subject sync: ${err.message}`));

    // Emit in-memory event for instant single subject sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.SUBJECT_UPDATED, {
      subjectId: created.id,
      data: created,
    });

    return created;
  }

  async patch(id: string, dto: PatchSubjectDto): Promise<SubjectEntity> {
    await this.getById(id);
    const fields: Partial<SubjectEntity> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.code !== undefined) {
      const code = String(dto.code).trim();
      if (!code) throw new UnprocessableEntityException('code cannot be blank');
      const dup = await this.subjectRepo.findByCode(code);
      if (dup && dup.id !== id) {
        throw new ConflictException('Another subject already uses this code');
      }
      fields.code = code;
    }

    const updated = await this.subjectRepo.updateById(id, fields);
    if (!updated) throw new NotFoundException('Subject not found');

    // Emit in-memory event for instant single subject sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.SUBJECT_UPDATED, {
      subjectId: id,
      data: fields,
    });

    return updated;
  }

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<SubjectEntity> {
    await this.getById(id);
    const updated = await this.subjectRepo.setStatus(id, status);
    if (!updated) throw new NotFoundException('Subject not found');

    this.subjectSyncQueueService.enqueueSubjectSyncJob({
      subjectIds: [id],
      triggeredBy: 'subject_status_changed',
    }).catch((err) => this.logger.error(`Failed to enqueue subject sync: ${err.message}`));

    // Emit in-memory event for instant single subject sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.SUBJECT_UPDATED, {
      subjectId: id,
      data: { status },
    });

    return updated;
  }

  async delete(id: string): Promise<SubjectEntity> {
    await this.getById(id);
    const deleted = await this.subjectRepo.softDelete(id);
    if (!deleted) throw new NotFoundException('Subject not found');

    this.subjectSyncQueueService.enqueueSubjectSyncJob({
      subjectIds: [id],
      triggeredBy: 'subject_deleted',
    }).catch((err) => this.logger.error(`Failed to enqueue subject sync: ${err.message}`));

    return deleted;
  }

  async bulkCreate(csvText: string): Promise<any> {
    const rows = parseCsv(csvText);
    const outcomes: any[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const created = await this.create({
          code: row.code,
          name: row.name,
          description: row.description || undefined,
        });
        outcomes.push({ row: i + 1, ok: true, data: created });
        succeeded += 1;
      } catch (err: any) {
        outcomes.push({
          row: i + 1,
          ok: false,
          error_code: err.status ? `HTTP_${err.status}` : 'error',
          error_message: err.message || String(err),
        });
        failed += 1;
      }
    }

    if (succeeded > 0) {
      this.subjectSyncQueueService.enqueueSubjectSyncJob({
        syncAll: true,
        triggeredBy: 'subjects_bulk_created',
      }).catch((err) => this.logger.error(`Failed to enqueue bulk subject sync: ${err.message}`));
    }

    return { total: rows.length, succeeded, failed, outcomes };
  }
}
