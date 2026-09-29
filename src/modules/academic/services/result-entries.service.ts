import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { RegistrationRepository } from '../../registration/repositories/registration.repository';
import { ResultEntryRepository } from '../repositories/result-entry.repository';
import { UserRepository } from '../../users/repositories/user.repository';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';
import { BulkResultEntriesDto, PatchResultEntryDto } from '../dto';

const ALLOWED_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce']);
const ALLOWED_SITTINGS = new Set([1, 2]);
const ROLE_INST_REVIEW = new Set([
  'super_admin',
  'admin',
  'registrar',
  'program_director',
  'institution_admin',
]);

function normalizeGrade(rawGrade?: string | null): string | null {
  if (!rawGrade) return null;
  const g = String(rawGrade).trim().toUpperCase();
  const m: Record<string, string> = {
    A1: 'A',
    B2: 'B',
    B3: 'B',
    C4: 'C',
    C5: 'C',
    C6: 'C',
    D7: 'D',
    E8: 'E',
    F9: 'F',
    A: 'A',
    B: 'B',
    C: 'C',
    D: 'D',
    E: 'E',
    F: 'F',
    U: 'F',
  };
  return m[g] || null;
}

@Injectable()
export class ResultEntriesService {
  private readonly logger;

  constructor(
    private readonly regRepo: RegistrationRepository,
    private readonly resultEntryRepo: ResultEntryRepository,
    private readonly userRepo: UserRepository,
    private readonly scopeService: InstitutionUserScopeService,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(ResultEntriesService.name);
  }

  private async userHasInstReview(userId: string): Promise<boolean> {
    const roles = await this.userRepo.findUserRoles(userId);
    return roles.some((r) => ROLE_INST_REVIEW.has(r.role));
  }

  private validateBulkPayload(body: BulkResultEntriesDto) {
    if (!body || typeof body !== 'object') {
      throw new UnprocessableEntityException('Body is required');
    }
    if (!Array.isArray(body.entries) || body.entries.length === 0) {
      throw new UnprocessableEntityException('entries[] is required');
    }
    if (body.entries.length > 50) {
      throw new UnprocessableEntityException('entries[] cannot exceed 50 rows');
    }

    const errors: Array<{ path: string; field?: string; error_code: string }> = [];
    const cleaned: Array<{
      source: string;
      sitting: number;
      serial: number;
      subject: string;
      grade: string;
      score: number | null;
      gradeNormalized: string | null;
    }> = [];
    const seenKeys = new Set<string>();

    body.entries.forEach((raw, idx) => {
      const path = `entries[${idx}]`;
      const source = raw.source && String(raw.source).toLowerCase().trim();
      const sitting = Number(raw.sitting);
      const serial = Number(raw.serial);
      const subject = raw.subject && String(raw.subject).trim();
      const grade = raw.grade && String(raw.grade).trim().toUpperCase();
      const score = raw.score === undefined || raw.score === null ? null : Number(raw.score);

      if (!source || !ALLOWED_SOURCES.has(source)) {
        errors.push({ path, field: 'source', error_code: 'source_invalid' });
      }
      if (!ALLOWED_SITTINGS.has(sitting)) {
        errors.push({ path, field: 'sitting', error_code: 'sitting_invalid' });
      }
      if (!Number.isInteger(serial) || serial < 0) {
        errors.push({ path, field: 'serial', error_code: 'serial_invalid' });
      }
      if (!subject || subject.length < 2) {
        errors.push({ path, field: 'subject', error_code: 'subject_required' });
      }
      if (!grade || grade.length > 4 || normalizeGrade(grade) === null) {
        errors.push({ path, field: 'grade', error_code: 'grade_invalid' });
      }
      if (score !== null && (Number.isNaN(score) || score < 0 || score > 100)) {
        errors.push({ path, field: 'score', error_code: 'score_invalid' });
      }

      const key = `${source}|${sitting}|${serial}`;
      if (seenKeys.has(key)) {
        errors.push({ path, error_code: 'duplicate_serial_in_payload' });
      }
      seenKeys.add(key);

      cleaned.push({
        source: source!,
        sitting,
        serial,
        subject: subject ? subject.toUpperCase() : '',
        grade: grade!,
        score,
        gradeNormalized: normalizeGrade(grade),
      });
    });

    if (errors.length) {
      throw new UnprocessableEntityException({
        message: 'Result entries payload invalid',
        details: { errors },
      });
    }
    return cleaned;
  }

  async listMine(userId: string) {
    const reg = await this.regRepo.findLatestForUser(userId);
    if (!reg) throw new NotFoundException('No registration found for current user');
    const rows = await this.resultEntryRepo.findByRegistration(reg.id);
    return { registration_id: reg.id, entries: rows };
  }

  async upsertMine(userId: string, body: BulkResultEntriesDto) {
    const reg = await this.regRepo.findLatestForUser(userId);
    if (!reg) throw new NotFoundException('No registration found for current user');
    const cleaned = this.validateBulkPayload(body);

    const rows = cleaned.map((c) => ({
      registrationId: reg.id,
      ...c,
      origin: 'manual',
      ocrJobId: null,
      createdBy: userId,
    }));

    const saved = await this.resultEntryRepo.bulkUpsert(rows);
    return {
      registration_id: reg.id,
      upserted_count: saved.length,
      entries: saved,
    };
  }

  async patchMineEntry(userId: string, entryId: string, body: PatchResultEntryDto) {
    const existing = await this.resultEntryRepo.findById(entryId);
    if (!existing) throw new NotFoundException('Entry not found');

    const reg = await this.regRepo.findLatestForUser(userId);
    if (!reg || reg.id !== existing.registrationId) {
      throw new ForbiddenException('Forbidden: entry belongs to another registration');
    }

    const errors: Array<{ field: string; error_code: string }> = [];
    const update: Partial<typeof existing> = { origin: 'manual', createdBy: userId };

    if (body.subject !== undefined) {
      const s = String(body.subject || '').trim();
      if (s.length < 2) errors.push({ field: 'subject', error_code: 'subject_required' });
      else update.subject = s.toUpperCase();
    }
    if (body.grade !== undefined) {
      const g = String(body.grade || '').trim().toUpperCase();
      if (!g || g.length > 4) {
        errors.push({ field: 'grade', error_code: 'grade_invalid' });
      } else {
        update.grade = g;
        update.gradeNormalized = normalizeGrade(g);
      }
    }
    if (body.score !== undefined) {
      if (body.score === null) {
        update.score = null;
      } else {
        const n = Number(body.score);
        if (Number.isNaN(n) || n < 0 || n > 100) {
          errors.push({ field: 'score', error_code: 'score_invalid' });
        } else {
          update.score = Math.round(n);
        }
      }
    }
    if (errors.length) {
      throw new UnprocessableEntityException({
        message: 'Override payload invalid',
        details: { errors },
      });
    }

    return this.resultEntryRepo.updateById(entryId, update);
  }

  async listForInstitution(viewerId: string, registrationId: string) {
    const ok = await this.userHasInstReview(viewerId);
    if (!ok) throw new ForbiddenException('Forbidden');

    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    await this.scopeService.assertUniversityAccess(viewerId, reg.universityId);

    const rows = await this.resultEntryRepo.listForInstitutionWithOcr(registrationId);

    const groups: Record<string, { source: string; sitting: number; rows: any[] }> = {};
    for (const row of rows) {
      const key = `${row.source}-${row.sitting}`;
      if (!groups[key]) {
        groups[key] = {
          source: row.source,
          sitting: row.sitting,
          rows: [],
        };
      }
      groups[key].rows.push({
        id: row.id,
        serial: row.serial,
        subject: row.subject,
        grade: row.grade,
        grade_normalized: row.grade_normalized,
        score: row.score,
        origin: row.origin,
        ocr_job_id: row.ocr_job_id,
        ocr_confidence:
          row.ocr_confidence !== null && row.ocr_confidence !== undefined
            ? Number(row.ocr_confidence)
            : null,
        ocr_exam_type: row.ocr_exam_type,
        updated_at: row.updated_at,
      });
    }

    return {
      registration_id: registrationId,
      groups: Object.values(groups).map((g) => ({
        source: g.source,
        sitting: g.sitting,
        subjects: g.rows.sort((a, b) => a.serial - b.serial),
      })),
    };
  }

  async patchInstitutionEntry(viewerId: string, entryId: string, body: PatchResultEntryDto) {
    const ok = await this.userHasInstReview(viewerId);
    if (!ok) throw new ForbiddenException('Forbidden');

    const existing = await this.resultEntryRepo.findById(entryId);
    if (!existing) throw new NotFoundException('Entry not found');

    const reg = await this.regRepo.findById(existing.registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    await this.scopeService.assertUniversityAccess(viewerId, reg.universityId);

    const errors: Array<{ field: string; error_code: string }> = [];
    const update: Partial<typeof existing> = { origin: 'manual' };

    if (body.subject !== undefined) {
      const s = String(body.subject || '').trim();
      if (s.length < 2) errors.push({ field: 'subject', error_code: 'subject_required' });
      else update.subject = s.toUpperCase();
    }
    if (body.grade !== undefined) {
      const g = String(body.grade || '').trim().toUpperCase();
      if (!g || g.length > 4) {
        errors.push({ field: 'grade', error_code: 'grade_invalid' });
      } else {
        update.grade = g;
        update.gradeNormalized = normalizeGrade(g);
      }
    }
    if (body.score !== undefined) {
      if (body.score === null) {
        update.score = null;
      } else {
        const n = Number(body.score);
        if (Number.isNaN(n) || n < 0 || n > 100) {
          errors.push({ field: 'score', error_code: 'score_invalid' });
        } else {
          update.score = Math.round(n);
        }
      }
    }
    if (errors.length) {
      throw new UnprocessableEntityException({
        message: 'Override payload invalid',
        details: { errors },
      });
    }

    return this.resultEntryRepo.updateById(entryId, update);
  }
}
