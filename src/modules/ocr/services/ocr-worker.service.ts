import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OcrJobEntity, OcrResultEntity } from '../entities';
import { runChain } from '../pipelines/extraction.pipeline';
import { parseResult } from '../parsers';
import { loadFileBuffer } from '../utils/file-loader';

const MAX_CONCURRENCY = parseInt(process.env.OCR_TESSERACT_WORKER_COUNT || '2', 10);
const SUPPORTED_RESULT_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce']);

@Injectable()
export class OcrWorkerService {
  private readonly logger = new Logger(OcrWorkerService.name);
  private active = 0;
  private readonly queue: Array<() => Promise<void>> = [];

  constructor(
    @InjectRepository(OcrJobEntity)
    private readonly jobRepo: Repository<OcrJobEntity>,
    @InjectRepository(OcrResultEntity)
    private readonly resultRepo: Repository<OcrResultEntity>,
    private readonly dataSource: DataSource,
  ) {}

  private next() {
    if (this.active >= MAX_CONCURRENCY) return;
    const task = this.queue.shift();
    if (!task) return;
    this.active += 1;
    task()
      .catch(() => {})
      .finally(() => {
        this.active -= 1;
        this.next();
      });
  }

  private schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const v = await fn();
          resolve(v);
        } catch (err) {
          reject(err);
        }
      });
      this.next();
    });
  }

  enqueue(
    jobId: string,
    opts: { directBuffer?: Buffer | null; directMime?: string | null; directFilename?: string | null } = {},
  ): Promise<OcrJobEntity> {
    return this.schedule(() => this.processJob(jobId, opts));
  }

  async processJob(
    jobId: string,
    { directBuffer = null, directMime = null, directFilename = null }: { directBuffer?: Buffer | null; directMime?: string | null; directFilename?: string | null } = {},
  ): Promise<OcrJobEntity> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) {
      const err: any = new Error('Job not found');
      err.code = 'OCR_JOB_NOT_FOUND';
      throw err;
    }

    job.status = 'processing';
    job.attempt_count += 1;
    job.started_at = job.started_at || new Date();
    await this.jobRepo.save(job);

    let bufferInput: { buffer: Buffer; mimeType: string; filename: string };
    try {
      if (directBuffer) {
        bufferInput = {
          buffer: directBuffer,
          mimeType: directMime || 'application/pdf',
          filename: directFilename || `${job.id}`,
        };
      } else if (job.file_id) {
        const loaded = await loadFileBuffer(this.dataSource, job.file_id);
        bufferInput = {
          buffer: loaded.buffer,
          mimeType: loaded.mimeType,
          filename: loaded.filename,
        };
      } else {
        throw new Error('No file buffer or file_id provided for job');
      }
    } catch (err: any) {
      job.status = 'failed';
      job.error_code = err.code || 'OCR_FILE_NOT_FOUND';
      job.error_message = err.message;
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw err;
    }

    let extraction: any;
    try {
      extraction = await runChain({
        ...bufferInput,
        forcedProvider: job.provider && job.provider !== 'pdf_text' ? null : null,
      });
    } catch (err: any) {
      job.status = 'failed';
      job.error_code = err.code || 'OCR_PROVIDER_FAILED';
      job.error_message = err.message;
      job.completed_at = new Date();
      await this.jobRepo.save(job);
      throw err;
    }

    const { result_json, exam_type_detected } = parseResult({
      text: extraction.result.text,
      examType: job.exam_type,
    });

    const parserPenalty = Math.min(
      20,
      (result_json.warnings || []).filter((w: string) => w.startsWith('low_confidence')).length * 5 +
        ((result_json.warnings || []).includes('no_subjects_parsed') ? 30 : 0),
    );
    const finalConfidence = Math.max(
      0,
      Math.min(100, extraction.result.providerConfidence - parserPenalty),
    );
    result_json.confidence = Number(finalConfidence.toFixed(2));

    await this.resultRepo.save({
      job_id: job.id,
      exam_type_detected,
      confidence: finalConfidence,
      result_json,
      raw_text: extraction.result.text,
      provider_payload: extraction.result.providerPayload || {},
      page_count: extraction.result.pages || 1,
    });

    await this.writeThroughToResultEntries(job, result_json, exam_type_detected).catch((err) => {
      this.logger.warn(`write-through to jupeb_result_entries failed for job ${job.id}: ${err.message}`);
    });

    job.status = 'completed';
    job.provider = extraction.result.providerName || job.provider;
    job.error_code = null;
    job.error_message = null;
    job.completed_at = new Date();
    return this.jobRepo.save(job);
  }

  private async writeThroughToResultEntries(job: OcrJobEntity, result_json: any, exam_type_detected: string) {
    const meta = job.metadata || {};
    const registrationId = meta.registration_id;
    if (!registrationId) return;
    if (!SUPPORTED_RESULT_SOURCES.has(exam_type_detected)) return;

    const subjects = Array.isArray(result_json && result_json.subjects) ? result_json.subjects : [];
    if (subjects.length === 0) return;

    const sitting = Number(meta.sitting) || 1;

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

    const rows = subjects.map((s: any, idx: number) => ({
      registration_id: registrationId,
      source: exam_type_detected,
      sitting,
      serial: idx,
      subject: String(s.name || '').trim().toUpperCase(),
      grade: String(s.grade || '').trim().toUpperCase(),
      grade_normalized: s.grade_normalized || normalizeGrade(s.grade),
      score: typeof s.score === 'number' ? Math.max(0, Math.min(100, Math.round(s.score))) : null,
      origin: 'ocr',
      ocr_job_id: job.id,
      created_by: meta.created_by || null,
    }));

    for (const row of rows) {
      await this.dataSource.query(
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
          row.registration_id,
          row.source,
          row.sitting,
          row.serial,
          row.subject,
          row.grade,
          row.grade_normalized,
          row.score,
          row.origin,
          row.ocr_job_id,
          row.created_by,
        ],
      );
    }
  }
}
