import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { UniversityRepository } from '../repositories/university.repository';
import { InstitutionAdminProvisionService } from './institution-admin-provision.service';
import { CreateUniversityDto, PatchUniversityDto, ListUniversitiesQueryDto } from '../dtos/university.dto';
import { UniversityEntity } from '../entities/university.entity';
import { CommodLogger, LoggerFactory } from '../../../logger';

const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
];

export function cleanJupebPrefix(prefix: string | number): string {
  if (prefix == null) return '';
  let str = String(prefix).trim().replace(/^['’`"]+/, '').trim();
  if (/^\d{1,2}$/.test(str)) {
    str = str.padStart(3, '0');
  }
  return str;
}

export function validateJupebPrefix(prefix: string | number): { ok: boolean; error?: string; prefix?: string } {
  const cleaned = cleanJupebPrefix(prefix);
  if (!/^[0-9]{3}$/.test(cleaned)) {
    return { ok: false, error: 'jupeb_prefix must be exactly 3 numeric characters' };
  }
  return { ok: true, prefix: cleaned };
}

function extractState(body: any = {}, university: any = {}): string | null {
  if (body.state) return String(body.state).trim();
  if (body.metadata && body.metadata.state) return String(body.metadata.state).trim();
  if (university.metadata && university.metadata.state) return String(university.metadata.state).trim();
  const addr = body.address || university.address;
  if (addr && typeof addr === 'string') {
    for (const st of NIGERIAN_STATES) {
      const regex = new RegExp(`\\b${st}\\b`, 'i');
      if (regex.test(addr)) {
        return st === 'Abuja' ? 'FCT' : st;
      }
    }
  }
  return null;
}

function parseCsv(text: string): Record<string, string>[] {
  if (!text || !String(text).trim()) return [];
  const src = String(text).replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  while (rows.length && rows[rows.length - 1].every((v) => !v || !String(v).trim())) {
    rows.pop();
  }
  if (!rows.length) return [];

  const headerRow = rows[0].map((h) => String(h).trim().toLowerCase());
  return rows
    .slice(1)
    .map((cells) => {
      const obj: Record<string, string> = {};
      for (let i = 0; i < headerRow.length; i += 1) {
        let val = cells[i] !== undefined ? cells[i] : '';
        if (typeof val === 'string') {
          val = val.trim().replace(/^['’`"]+/, '').trim();
        }
        obj[headerRow[i]] = val;
      }
      return obj;
    })
    .filter((obj) => Object.values(obj).some((v) => v != null && String(v).trim() !== ''));
}

import { InstitutionSyncQueueService } from '../../sync/services/institution-sync-queue.service';

@Injectable()
export class InstitutionsService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly universityRepo: UniversityRepository,
    private readonly provisionService: InstitutionAdminProvisionService,
    private readonly institutionSyncQueueService: InstitutionSyncQueueService,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(InstitutionsService.name);
  }

  async listPublic(query?: { type?: string }): Promise<UniversityEntity[]> {
    if (query?.type) {
      const allowed = new Set(['federal', 'state', 'private']);
      if (!allowed.has(query.type)) {
        throw new UnprocessableEntityException('type must be federal, state, or private');
      }
    }
    return this.universityRepo.findPublicActive({ universityType: query?.type || null });
  }

  async listAdmin(
    query: ListUniversitiesQueryDto,
    userId?: string,
  ): Promise<{ rows: any[]; page: number; limit: number; total: number }> {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const [rows, total] = await this.universityRepo.findAllAdmin({
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

    const enrolledMap = await this.universityRepo.enrolledCountsForUniversities(
      rows.map((r) => r.id),
      effectiveSessionId,
    );

    const enriched = rows.map((row) => ({
      ...row,
      enrolled_count: enrolledMap.get(row.id) || 0,
    }));

    return { rows: enriched, page: safePage, limit: safeLimit, total };
  }

  async getById(id: string): Promise<UniversityEntity> {
    if (!id) throw new UnprocessableEntityException('Invalid university id');
    const row = await this.universityRepo.findById(id);
    if (!row) throw new NotFoundException('University not found');
    return row;
  }

  async create(dto: CreateUniversityDto, createdBy?: string | null): Promise<any> {
    if (!dto.code || !dto.name || !dto.jupeb_prefix) {
      throw new UnprocessableEntityException('code, name, and jupeb_prefix are required');
    }

    const cleanedPrefix = cleanJupebPrefix(dto.jupeb_prefix);
    const prefixValidation = validateJupebPrefix(cleanedPrefix);
    if (!prefixValidation.ok) {
      throw new UnprocessableEntityException(prefixValidation.error);
    }

    // Check unique constraints
    const existingCode = await this.universityRepo.findByCode(dto.code);
    if (existingCode) {
      throw new ConflictException({
        message: 'University with this code already exists',
        details: { field: 'code', value: dto.code },
      });
    }

    const existingPrefix = await this.universityRepo.findByJupebPrefix(cleanedPrefix);
    if (existingPrefix) {
      throw new ConflictException({
        message: 'University with this JUPEB prefix already exists',
        details: { field: 'jupeb_prefix', value: cleanedPrefix },
      });
    }

    let university: UniversityEntity;
    try {
      university = await this.universityRepo.create({
        code: dto.code.trim(),
        name: dto.name.trim(),
        shortName: dto.short_name ? dto.short_name.trim() : null,
        jupebPrefix: cleanedPrefix,
        universityType: dto.university_type || null,
        email: dto.email ? dto.email.trim().toLowerCase() : null,
        address: dto.address ? dto.address.trim() : null,
        phone: dto.phone ? dto.phone.trim() : null,
        expectedCandidateCount: dto.expected_candidate_count != null ? Number(dto.expected_candidate_count) : null,
        description: dto.description ? dto.description.trim() : null,
        metadata: dto.metadata || {},
        status: 'active',
      });
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictException({
          message: 'University already exists with this code, prefix or email',
          details: err.detail,
        });
      }
      throw err;
    }

    try {
      const admin = await this.provisionService.provisionOnUniversityCreate(dto, {
        universityId: university.id,
        universityName: university.name,
        createdBy,
      });

      // Enqueue async sync to CRMS and Attendance via BullMQ
      this.institutionSyncQueueService.enqueueInstitutionSyncJob({
        universityIds: [university.id],
        userId: createdBy,
        triggeredBy: 'institution_created',
      }).catch((err) => this.logger.error(`Failed to enqueue institution sync: ${err.message}`));

      return {
        ...university,
        institution_admin: admin.institution_admin,
      };
    } catch (err) {
      await this.universityRepo.softDelete(university.id).catch(() => {});
      throw err;
    }
  }

  async patch(id: string, dto: PatchUniversityDto, userId?: string | null): Promise<UniversityEntity> {
    await this.getById(id);

    const fields: Partial<UniversityEntity> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.short_name !== undefined) fields.shortName = dto.short_name;
    if (dto.metadata !== undefined) fields.metadata = dto.metadata;
    if (dto.code !== undefined) fields.code = dto.code;
    if (dto.jupeb_prefix !== undefined) {
      const cleaned = cleanJupebPrefix(dto.jupeb_prefix);
      const val = validateJupebPrefix(cleaned);
      if (!val.ok) throw new UnprocessableEntityException(val.error);
      fields.jupebPrefix = cleaned;
    }
    if (dto.university_type !== undefined) fields.universityType = dto.university_type;
    if (dto.email !== undefined) fields.email = dto.email ? dto.email.trim().toLowerCase() : null;
    if (dto.address !== undefined) fields.address = dto.address ? dto.address.trim() : null;
    if (dto.phone !== undefined) fields.phone = dto.phone ? dto.phone.trim() : null;
    if (dto.expected_candidate_count !== undefined) {
      fields.expectedCandidateCount = dto.expected_candidate_count != null ? Number(dto.expected_candidate_count) : null;
    }
    if (dto.description !== undefined) fields.description = dto.description ? dto.description.trim() : null;
    if (dto.status !== undefined) {
      fields.status = dto.status === 'active' ? 'active' : 'inactive';
    } else if (dto.is_active !== undefined) {
      fields.status = dto.is_active ? 'active' : 'inactive';
    }

    const updated = await this.universityRepo.updateById(id, fields);
    if (!updated) throw new NotFoundException('University not found');

    this.institutionSyncQueueService.enqueueInstitutionSyncJob({
      universityIds: [id],
      userId,
      triggeredBy: 'institution_updated',
    }).catch((err) => this.logger.error(`Failed to enqueue institution sync: ${err.message}`));

    return updated;
  }

  async setStatus(id: string, status: 'active' | 'inactive', userId?: string | null): Promise<UniversityEntity> {
    await this.getById(id);
    const updated = await this.universityRepo.setStatus(id, status);
    if (!updated) throw new NotFoundException('University not found');

    this.institutionSyncQueueService.enqueueInstitutionSyncJob({
      universityIds: [id],
      userId,
      triggeredBy: 'institution_status_changed',
    }).catch((err) => this.logger.error(`Failed to enqueue institution sync: ${err.message}`));

    return updated;
  }

  async delete(id: string, userId?: string | null): Promise<UniversityEntity> {
    await this.getById(id);
    const deleted = await this.universityRepo.softDelete(id);
    if (!deleted) throw new NotFoundException('University not found');

    this.institutionSyncQueueService.enqueueInstitutionSyncJob({
      universityIds: [id],
      userId,
      triggeredBy: 'institution_deleted',
    }).catch((err) => this.logger.error(`Failed to enqueue institution sync: ${err.message}`));

    return deleted;
  }

  async bulkCreate(csvText: string, createdBy?: string | null): Promise<any> {
    const rows = parseCsv(csvText);
    const outcomes: any[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      try {
        const created = await this.create(
          {
            code: row.code,
            name: row.name,
            short_name: row.short_name || undefined,
            jupeb_prefix: cleanJupebPrefix(row.jupeb_prefix || row.prefix),
            university_type: (row.university_type as any) || undefined,
            email: row.email,
            address: row.address || undefined,
            phone: row.phone || undefined,
            expected_candidate_count: row.expected_candidate_count ? Number(row.expected_candidate_count) : undefined,
            description: row.description || undefined,
            metadata: row.state ? { state: row.state } : {},
          },
          createdBy,
        );
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
      this.institutionSyncQueueService.enqueueInstitutionSyncJob({
        syncAll: true,
        userId: createdBy,
        triggeredBy: 'institutions_bulk_created',
      }).catch((err) => this.logger.error(`Failed to enqueue bulk institution sync: ${err.message}`));
    }

    return { total: rows.length, succeeded, failed, outcomes };
  }

  async resendCredentials(email: string): Promise<any> {
    return this.provisionService.resendCredentials(email);
  }

  private async syncInstitutionToCrms(university: UniversityEntity, body: any = {}) {
    try {
      const crmsProviders = require('../../integrations/crms');
      const provider = crmsProviders?.get ? crmsProviders.get() : null;
      if (!provider?.syncInstitutions) return;

      const code = university.jupebPrefix || university.code || body.code;
      const name = university.name || body.name;
      const shortCode = university.shortName || body.short_name || body.shortCode || university.code;
      const rawCategory = body.category || university.universityType;
      const category = rawCategory
        ? rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1).toLowerCase()
        : null;
      const state = extractState(body, university);

      const payload = [{ code, name, shortCode, category, state }];
      await provider.syncInstitutions(payload);
      this.logger.log(`[CrmsSync] Institution ${code} synced successfully.`);
    } catch (err: any) {
      this.logger.error(`[CrmsSync] Failed to sync institution: ${err.message}`);
    }
  }

  private async syncInstitutionToAttendance(university: UniversityEntity, body: any = {}) {
    try {
      const attendanceProviders = require('../../integrations/attendance');
      const provider = attendanceProviders?.get ? attendanceProviders.get() : null;
      if (!provider?.syncInstitutions) return;

      const institutionCode = university.jupebPrefix || university.code || body.jupeb_prefix || body.code;
      const institutionName = university.name || body.name;
      const address = (body.address || university.address || extractState(body, university) || 'Nigeria').trim();

      const coordinates = {
        latitude: 6.4518847,
        longitude: 3.33262,
      };

      const payload = {
        institutions: [
          {
            institutionCode,
            institutionName,
            address,
            coordinates,
            lectureRadius: 100,
          },
        ],
      };

      await provider.syncInstitutions(payload);
      this.logger.log(`[AttendanceSync] Institution ${institutionCode} synced successfully.`);
    } catch (err: any) {
      this.logger.error(`[AttendanceSync] Failed to sync institution: ${err.message}`);
    }
  }
}
