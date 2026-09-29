import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SubjectCombinationRepository } from '../repositories/subject-combination.repository';
import { SubjectRepository } from '../repositories/subject.repository';
import { SubjectCombinationEntity } from '../entities/subject-combination.entity';
import {
  CreateSubjectCombinationDto,
  PatchSubjectCombinationDto,
  ListSubjectCombinationsQueryDto,
} from '../dtos/subject-combination.dto';
import { CommodLogger, LoggerFactory } from '../../../logger';

function normalizeSubjects(raw: unknown): { subjects: string[] | null; error: string | null } {
  if (!Array.isArray(raw)) {
    return { subjects: null, error: 'subjects must be an array of strings' };
  }
  const seen = new Map<string, string>();
  for (const item of raw) {
    if (typeof item !== 'string') {
      return { subjects: null, error: 'each subject must be a string' };
    }
    const t = item.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }
  const subjects = Array.from(seen.values());
  if (subjects.length < 3) {
    return { subjects: null, error: 'at least 3 unique subjects are required' };
  }
  if (subjects.length > 6) {
    return { subjects: null, error: 'at most 6 unique subjects are allowed' };
  }
  return { subjects, error: null };
}

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

@Injectable()
export class SubjectCombinationsService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly combinationRepo: SubjectCombinationRepository,
    private readonly subjectRepo: SubjectRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(SubjectCombinationsService.name);
  }

  async listPublic(query?: { universityId?: string }): Promise<any[]> {
    const rows = await this.combinationRepo.findPublicActive({
      universityId: query?.universityId || null,
    });
    return this.embedSubjectItemsBatch(rows);
  }

  async listAdmin(
    query: ListSubjectCombinationsQueryDto,
  ): Promise<{ rows: any[]; page: number; limit: number; total: number }> {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const [rows, total] = await this.combinationRepo.findAllAdmin({
      limit: safeLimit,
      offset,
      status: query.status,
      universityId: query.university_id,
      q: query.q,
      sortBy: query.sort_by || query.sortBy,
      sortOrder: query.sort_order || query.sortOrder,
    });

    const enriched = await this.embedSubjectItemsBatch(rows, { withEnrolled: true });
    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async getById(id: string, options: { embedItems?: boolean } = {}): Promise<any> {
    if (!id) throw new UnprocessableEntityException('Invalid subject combination id');
    const row = await this.combinationRepo.findById(id);
    if (!row) throw new NotFoundException('Subject combination not found');
    if (options.embedItems) {
      const itemsMap = await this.combinationRepo.listItemsForCombinations([row.id]);
      return {
        ...row,
        subject_items: itemsMap.get(row.id) || [],
      };
    }
    return row;
  }

  private async resolveSubjectIds(codes: string[]): Promise<string[]> {
    const trimmed = codes.map((c) => String(c).trim()).filter(Boolean);
    const ids: string[] = [];
    const missing: string[] = [];

    for (const value of trimmed) {
      let subj = await this.subjectRepo.findByCode(value);
      if (!subj) {
        subj = await this.subjectRepo.findByName(value);
      }
      if (subj) {
        ids.push(subj.id);
      } else {
        // Auto-create for legacy compatibility
        const upper = value.toUpperCase().slice(0, 20);
        try {
          const created = await this.subjectRepo.create({
            code: upper,
            name: value,
            status: 'active',
          });
          ids.push(created.id);
        } catch {
          const again = await this.subjectRepo.findByCode(upper);
          if (again) {
            ids.push(again.id);
          } else {
            missing.push(value);
          }
        }
      }
    }

    if (missing.length > 0) {
      throw new UnprocessableEntityException(`Unknown subject code(s): ${missing.join(', ')}`);
    }

    return ids;
  }

  async create(dto: CreateSubjectCombinationDto): Promise<any> {
    if (!dto.code) throw new UnprocessableEntityException('code is required');
    if (!dto.subjects) throw new UnprocessableEntityException('subjects is required');

    const norm = normalizeSubjects(dto.subjects);
    if (norm.error) throw new UnprocessableEntityException(norm.error);

    const subjectIds = await this.resolveSubjectIds(norm.subjects!);

    let title = dto.title ? String(dto.title).trim() : '';
    if (!title) {
      title = norm.subjects!.join(', ');
    }

    const isGlobal = dto.is_global !== false;
    if (!isGlobal && !dto.university_id) {
      throw new UnprocessableEntityException('university_id is required when is_global is false');
    }

    const created = await this.combinationRepo.create({
      code: dto.code.trim(),
      title,
      isGlobal,
      universityId: isGlobal ? null : dto.university_id || null,
      status: 'active',
    });

    await this.combinationRepo.replaceItems(created.id, subjectIds);

    const itemsMap = await this.combinationRepo.listItemsForCombinations([created.id]);
    return {
      ...created,
      subject_items: itemsMap.get(created.id) || [],
    };
  }

  async patch(id: string, dto: PatchSubjectCombinationDto): Promise<any> {
    await this.getById(id);
    const fields: Partial<SubjectCombinationEntity> = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.code !== undefined) fields.code = dto.code;

    let newSubjectIds: string[] | null = null;
    if (dto.subjects !== undefined) {
      const norm = normalizeSubjects(dto.subjects);
      if (norm.error) throw new UnprocessableEntityException(norm.error);
      newSubjectIds = await this.resolveSubjectIds(norm.subjects!);
    }

    if (dto.is_global !== undefined || dto.university_id !== undefined) {
      fields.isGlobal = dto.is_global !== false;
      fields.universityId = fields.isGlobal ? null : dto.university_id || null;
      if (!fields.isGlobal && !fields.universityId) {
        throw new UnprocessableEntityException('university_id is required when is_global is false');
      }
    }

    const updated = await this.combinationRepo.updateById(id, fields);
    if (!updated) throw new NotFoundException('Subject combination not found');

    if (newSubjectIds) {
      await this.combinationRepo.replaceItems(updated.id, newSubjectIds);
    }

    const itemsMap = await this.combinationRepo.listItemsForCombinations([updated.id]);
    return {
      ...updated,
      subject_items: itemsMap.get(updated.id) || [],
    };
  }

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<any> {
    await this.getById(id);
    const updated = await this.combinationRepo.setStatus(id, status);
    if (!updated) throw new NotFoundException('Subject combination not found');
    return updated;
  }

  async delete(id: string): Promise<any> {
    await this.getById(id);
    const deleted = await this.combinationRepo.softDelete(id);
    if (!deleted) throw new NotFoundException('Subject combination not found');
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
        const subjects = String(row.subjects || '')
          .split(/[,;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        const created = await this.create({
          code: row.code,
          title: row.title || undefined,
          subjects,
          is_global: row.is_global === undefined ? true : row.is_global !== 'false',
          university_id: row.university_id || undefined,
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

    return { total: rows.length, succeeded, failed, outcomes };
  }

  private async embedSubjectItemsBatch(
    rows: SubjectCombinationEntity[],
    options: { withEnrolled?: boolean } = {},
  ): Promise<any[]> {
    if (!rows || !rows.length) return [];
    const ids = rows.map((r) => r.id);
    const itemsMap = await this.combinationRepo.listItemsForCombinations(ids);
    const enrolledMap = options.withEnrolled
      ? await this.combinationRepo.enrolledCountsForCombinations(ids)
      : null;

    return rows.map((row) => ({
      ...row,
      subject_items: itemsMap.get(row.id) || [],
      ...(options.withEnrolled ? { enrolled_count: enrolledMap?.get(row.id) || 0 } : {}),
    }));
  }
}
