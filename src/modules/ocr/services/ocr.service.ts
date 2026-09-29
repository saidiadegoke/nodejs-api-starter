import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OcrJobEntity, OcrResultEntity } from '../entities';
import { OcrWorkerService } from './ocr-worker.service';
import { FilesService } from '../../files/services/files.service';
import {
  assertMimeAllowed,
  assertSizeAllowed,
  assertExamType,
  isUuid,
} from '../validations/ocr.validation';
import { OLEVEL_SUBJECTS } from '../constants/olevel-subjects';

const STAFF_ROLES = new Set(['admin', 'super_admin', 'registrar']);
const SYNC_WAIT_MS = 30000;

function ocrError(code: string, message: string, status: number) {
  const err: any = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

@Injectable()
export class OcrService {
  constructor(
    @InjectRepository(OcrJobEntity)
    private readonly jobRepo: Repository<OcrJobEntity>,
    @InjectRepository(OcrResultEntity)
    private readonly resultRepo: Repository<OcrResultEntity>,
    private readonly filesService: FilesService,
    private readonly workerService: OcrWorkerService,
    private readonly dataSource: DataSource,
  ) {}

  private async isStaff(userId?: string): Promise<boolean> {
    if (!userId) return false;
    const rows = await this.dataSource.query(
      `SELECT role_code FROM user_roles WHERE user_id = $1`,
      [userId],
    );
    return rows.some((r: any) => STAFF_ROLES.has(r.role_code));
  }

  private async canReadAny(userId?: string): Promise<boolean> {
    if (await this.isStaff(userId)) return true;
    const rows = await this.dataSource.query(
      `SELECT 1 FROM user_roles ur
       JOIN role_permissions rp ON ur.role_code = rp.role_code
       WHERE ur.user_id = $1 AND rp.permission_code = 'ocr.read.any'`,
      [userId],
    );
    return rows.length > 0;
  }

  async createJob({
    userId,
    fileId = null,
    multerFile = null,
    base64 = null,
    examType = 'auto',
    wait = false,
    context = null,
    metadata = {},
  }: {
    userId: string;
    fileId?: string | null;
    multerFile?: any;
    base64?: { data: string; filename: string; mime_type?: string } | null;
    examType?: string;
    wait?: boolean;
    context?: string | null;
    metadata?: Record<string, any>;
  }) {
    assertExamType(examType);

    let fileRecord: any;
    let directBuffer: Buffer | null = null;
    let directMime: string | null = null;
    let directFilename: string | null = null;

    if (multerFile) {
      assertMimeAllowed(multerFile.mimetype);
      assertSizeAllowed(multerFile.size || (multerFile.buffer && multerFile.buffer.length) || 0);
      fileRecord = await this.filesService.uploadFile(multerFile, userId, context || 'ocr');
      directBuffer = multerFile.buffer;
      directMime = multerFile.mimetype;
      directFilename = multerFile.originalname;
    } else if (base64 && base64.data && base64.filename) {
      const buffer = Buffer.from(
        String(base64.data).replace(/^data:.+;base64,/, ''),
        'base64',
      );
      const mime = base64.mime_type || 'application/pdf';
      assertMimeAllowed(mime);
      assertSizeAllowed(buffer.length);
      fileRecord = await this.filesService.uploadFromBase64(
        {
          file_data: base64.data,
          file_name: base64.filename,
          context: context || 'ocr',
        },
        userId,
      );
      directBuffer = buffer;
      directMime = mime;
      directFilename = base64.filename;
    } else if (fileId) {
      if (!isUuid(fileId)) {
        throw new BadRequestException('file_id is not a valid uuid');
      }
      fileRecord = await this.filesService.getFile(fileId, userId);
      if (!fileRecord) {
        throw new NotFoundException('File not found');
      }
      const owns = fileRecord.uploaded_by === userId;
      if (!owns && !(await this.canReadAny(userId))) {
        throw new ForbiddenException('Not allowed to access this file');
      }
      assertMimeAllowed(fileRecord.file_type);
      assertSizeAllowed(fileRecord.file_size || 0);
    } else {
      throw new BadRequestException(
        'Provide one of: file (multipart), file_id (json), or data+filename (json)',
      );
    }

    const job = await this.jobRepo.save({
      file_id: fileRecord.id,
      exam_type: examType,
      provider: 'pdf_text',
      requested_by: userId,
      context,
      metadata: { ...metadata, source_file_id: fileRecord.id },
    });

    const promise = this.workerService.enqueue(job.id, {
      directBuffer,
      directMime,
      directFilename,
    });

    if (!wait) {
      promise.catch(() => {});
      return { job, completedJob: null };
    }

    const completedJob = await Promise.race([
      promise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), SYNC_WAIT_MS)),
    ]);
    if (completedJob) {
      return { job, completedJob };
    }
    const refreshed = await this.jobRepo.findOne({ where: { id: job.id } });
    return { job, completedJob: refreshed };
  }

  async getJob(jobId: string, viewerId: string) {
    if (!isUuid(jobId)) throw new BadRequestException('Invalid job id');
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');

    const owns = job.requested_by === viewerId;
    const staff = await this.canReadAny(viewerId);
    if (!owns && !staff) {
      throw new ForbiddenException('Not allowed to view this job');
    }
    const result = await this.resultRepo.findOne({ where: { job_id: jobId } });
    return { job, result, viewerIsStaff: staff };
  }

  async listJobs({
    viewerId,
    status,
    examType,
    fileId,
    page = 1,
    limit = 50,
  }: {
    viewerId: string;
    status?: string;
    examType?: string;
    fileId?: string;
    page?: number;
    limit?: number;
  }) {
    const staff = await this.canReadAny(viewerId);
    const requestedBy = staff ? undefined : viewerId;

    const queryBuilder = this.jobRepo.createQueryBuilder('job');
    if (requestedBy) queryBuilder.andWhere('job.requested_by = :requestedBy', { requestedBy });
    if (status) queryBuilder.andWhere('job.status = :status', { status });
    if (examType) queryBuilder.andWhere('job.exam_type = :examType', { examType });
    if (fileId) queryBuilder.andWhere('job.file_id = :fileId', { fileId });

    queryBuilder.orderBy('job.created_at', 'DESC');
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [rows, total] = await queryBuilder.getManyAndCount();
    return { rows, total, page, limit, viewerIsStaff: staff };
  }

  async retryJob(jobId: string, viewerId: string) {
    const { job } = await this.getJob(jobId, viewerId);
    if (job.status !== 'failed') {
      throw new ConflictException('Only failed jobs can be retried');
    }
    const newJob = await this.jobRepo.save({
      file_id: job.file_id,
      exam_type: job.exam_type,
      provider: 'pdf_text',
      requested_by: viewerId,
      context: job.context,
      metadata: { ...(job.metadata || {}), retry_of: job.id },
    });
    const promise = this.workerService.enqueue(newJob.id, {});
    promise.catch(() => {});
    return newJob;
  }

  async bindRequirement({
    jobId,
    viewerId,
    registrationId,
    requirementId,
  }: {
    jobId: string;
    viewerId: string;
    registrationId: string;
    requirementId: string;
  }) {
    if (!isUuid(jobId)) throw new BadRequestException('Invalid job id');
    if (!isUuid(registrationId)) throw new BadRequestException('Invalid registration id');
    if (!isUuid(requirementId)) throw new BadRequestException('Invalid requirement id');

    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== 'completed') {
      throw new ConflictException('Only completed jobs can be bound');
    }
    const owns = job.requested_by === viewerId;
    const allowed = owns || (await this.canReadAny(viewerId));
    if (!allowed) {
      throw new ForbiddenException('Not allowed to bind this job');
    }

    job.metadata = {
      ...(job.metadata || {}),
      binding: {
        registration_id: registrationId,
        requirement_id: requirementId,
        bound_by: viewerId,
        bound_at: new Date().toISOString(),
      },
    };
    return this.jobRepo.save(job);
  }

  async getLatestForFile({ fileId, viewerId }: { fileId: string; viewerId: string }) {
    if (!isUuid(fileId)) throw new BadRequestException('Invalid file id');
    const file = await this.filesService.getFile(fileId, viewerId);
    if (!file) throw new NotFoundException('File not found');

    const staff = await this.canReadAny(viewerId);
    if (!staff && file.uploaded_by !== viewerId) {
      throw new ForbiddenException('Not allowed to view this file');
    }
    const job = await this.jobRepo.findOne({
      where: { file_id: fileId, status: 'completed' },
      order: { completed_at: 'DESC' },
    });
    if (!job) {
      throw new NotFoundException('No completed OCR job for this file');
    }
    const result = await this.resultRepo.findOne({ where: { job_id: job.id } });
    return { job, result, viewerIsStaff: staff };
  }

  async createManualEntry({
    userId,
    examType,
    subjects,
    metadata = {},
    context = null,
  }: {
    userId: string;
    examType: string;
    subjects: Array<{ name: string; grade: string; score?: number }>;
    metadata?: Record<string, any>;
    context?: string | null;
  }) {
    const { ALLOWED_EXAM_TYPES } = require('../validations/ocr.validation');
    const manualAllowed = ALLOWED_EXAM_TYPES.filter((t: string) => t !== 'auto');
    if (!manualAllowed.includes(examType)) {
      throw new BadRequestException(`exam_type must be one of: ${manualAllowed.join(', ')}`);
    }

    if (!Array.isArray(subjects) || subjects.length === 0) {
      throw new BadRequestException('subjects must be a non-empty array');
    }
    const VALID_GRADES = new Set(['A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9']);
    for (const s of subjects) {
      if (!s || typeof s.name !== 'string' || !s.name.trim()) {
        throw new BadRequestException('Each subject must have a non-empty name');
      }
      if (!s.grade || !VALID_GRADES.has(String(s.grade).toUpperCase())) {
        throw new BadRequestException(
          `Invalid grade '${s.grade}' for subject '${s.name}'. Allowed: ${[...VALID_GRADES].join(', ')}`,
        );
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const jobInsertRes = await queryRunner.query(
        `INSERT INTO ocr_jobs
           (file_id, exam_type, provider, status, attempt_count, started_at, completed_at, requested_by, context, metadata)
         VALUES (NULL, $1, 'manual', 'completed', 1, NOW(), NOW(), $2, $3, $4::jsonb)
         RETURNING *`,
        [examType, userId, context, JSON.stringify(metadata)],
      );
      const job = jobInsertRes[0];

      const normalisedSubjects = subjects.map((s) => ({
        name: s.name.trim(),
        grade: String(s.grade).toUpperCase(),
        score: s.score,
      }));

      const resultInsertRes = await queryRunner.query(
        `INSERT INTO ocr_results
           (job_id, exam_type_detected, confidence, result_json, raw_text, provider_payload, page_count)
         VALUES ($1, $2, 100, $3::jsonb, '', '{}'::jsonb, 0)
         RETURNING *`,
        [job.id, examType, JSON.stringify({ subjects: normalisedSubjects, source: 'manual' })],
      );
      const result = resultInsertRes[0];

      let registrationId = metadata && metadata.registration_id;
      if (!registrationId && userId) {
        const regRes = await queryRunner.query(
          `SELECT id FROM jupeb_registrations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
          [userId],
        );
        if (regRes[0]) {
          registrationId = regRes[0].id;
        }
      }

      const SUPPORTED_RESULT_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce', 'jamb']);
      if (registrationId && SUPPORTED_RESULT_SOURCES.has(examType.toLowerCase())) {
        const sitting = Number(metadata && metadata.sitting) || 1;
        const normalizeGrade = (raw: any) => {
          if (!raw) return null;
          const g = String(raw).trim().toUpperCase();
          const m: Record<string, string> = {
            A1: 'A',
            B2: 'B', B3: 'B',
            C4: 'C', C5: 'C', C6: 'C',
            D7: 'D',
            E8: 'E',
            F9: 'F',
            A: 'A', B: 'B', C: 'C', D: 'D', E: 'E', F: 'F',
            U: 'F',
          };
          return m[g] || null;
        };

        const rows = normalisedSubjects.map((s, idx) => ({
          registration_id: registrationId,
          source: examType.toLowerCase(),
          sitting,
          serial: idx,
          subject: String(s.name || '').trim().toUpperCase(),
          grade: String(s.grade || '').trim().toUpperCase(),
          grade_normalized: normalizeGrade(s.grade),
          score: typeof s.score === 'number' ? Math.max(0, Math.min(100, Math.round(s.score))) : null,
          origin: 'manual',
          ocr_job_id: job.id,
          created_by: userId || null,
        }));

        await queryRunner.query(
          `DELETE FROM jupeb_result_entries
           WHERE registration_id = $1 AND source = $2 AND sitting = $3 AND serial >= $4`,
          [registrationId, examType.toLowerCase(), sitting, rows.length],
        );

        for (const r of rows) {
          await queryRunner.query(
            `INSERT INTO jupeb_result_entries
               (registration_id, source, sitting, serial, subject, grade, grade_normalized, score, origin, ocr_job_id, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (registration_id, source, sitting, serial)
             DO UPDATE SET
               subject = EXCLUDED.subject,
               grade = EXCLUDED.grade,
               grade_normalized = EXCLUDED.grade_normalized,
               score = EXCLUDED.score,
               origin = EXCLUDED.origin,
               ocr_job_id = EXCLUDED.ocr_job_id,
               created_by = EXCLUDED.created_by,
               updated_at = NOW()`,
            [
              r.registration_id,
              r.source,
              r.sitting,
              r.serial,
              r.subject,
              r.grade,
              r.grade_normalized,
              r.score,
              r.origin,
              r.ocr_job_id,
              r.created_by,
            ],
          );
        }
      }

      await queryRunner.commitTransaction();
      return { job, result };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  getSubjects(board?: string) {
    const rawBoard = (board || '').toLowerCase().trim();
    const VALID_BOARDS = ['waec', 'neco', 'nabteb', 'gce'];

    if (rawBoard && !VALID_BOARDS.includes(rawBoard)) {
      throw new BadRequestException(
        `Invalid board '${rawBoard}'. Must be one of: ${VALID_BOARDS.join(', ')}`,
      );
    }

    const subjects = rawBoard
      ? OLEVEL_SUBJECTS.filter((s: any) => s.boards.includes(rawBoard))
      : OLEVEL_SUBJECTS;

    return { subjects, total: subjects.length };
  }
}
