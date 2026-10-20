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

export function cleanUniversityCode(code: string | number): string {
  if (code == null) return '';
  let str = String(code).trim().replace(/^['’`"]+/, '').trim();
  if (/^\d{1,2}$/.test(str)) {
    str = str.padStart(3, '0');
  }
  return str;
}

export function validateUniversityCode(code: string | number): { ok: boolean; error?: string; code?: string } {
  const cleaned = cleanUniversityCode(code);
  if (!/^[0-9]{3}$/.test(cleaned)) {
    return { ok: false, error: 'code must be exactly 3 numeric characters' };
  }
  return { ok: true, code: cleaned };
}

export function cleanJupebPrefix(prefix: string | number): string {
  if (prefix == null) return '';
  return String(prefix).trim().replace(/^['’`"]+/, '').trim().toUpperCase();
}

export function validateJupebPrefix(prefix: string | number): { ok: boolean; error?: string; prefix?: string } {
  const cleaned = cleanJupebPrefix(prefix);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 20) {
    return { ok: false, error: 'jupeb_prefix must be between 2 and 20 characters' };
  }
  return { ok: true, prefix: cleaned };
}

export function isPureDigits(val: any): boolean {
  if (val == null) return false;
  const str = String(val).trim().replace(/^['’`"]+/, '').trim();
  return str.length > 0 && /^\d+$/.test(str);
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
  const cleanText = String(text).replace(/^\uFEFF/, '').trim();
  if (!cleanText) return [];
  const src = cleanText.replace(/\r\n?/g, '\n');
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

  const headerRow = rows[0].map((h) =>
    String(h || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
  );

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

import { EventEmitter2 } from '@nestjs/event-emitter';
import { InstitutionSyncQueueService } from '../../sync/services/institution-sync-queue.service';
import { SyncEvent } from '../../sync/constants/sync-events.enum';


@Injectable()
export class InstitutionsService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly universityRepo: UniversityRepository,
    private readonly provisionService: InstitutionAdminProvisionService,
    private readonly institutionSyncQueueService: InstitutionSyncQueueService,
    private readonly eventEmitter: EventEmitter2,
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
    if (!effectiveSessionId) {
      try {
        const { resolveEffectiveSession } = require('../../jupeb/services/session-context.service');
        const session = await resolveEffectiveSession(userId || null, null);
        effectiveSessionId = session?.id || null;
      } catch {
        // Fallback
      }
    }

    const [enrolledMap, locksMap] = await Promise.all([
      this.universityRepo.enrolledCountsForUniversities(
        rows.map((r) => r.id),
        effectiveSessionId,
      ),
      this.universityRepo.locksForUniversities(
        rows.map((r) => r.id),
        effectiveSessionId,
      ),
    ]);

    const enriched = rows.map((row) => {
      const lock = locksMap.get(row.id);
      return {
        ...row,
        enrolled_count: enrolledMap.get(row.id) || 0,
        locked: Boolean(lock?.locked),
        is_locked: Boolean(lock?.locked),
        lock_reason: lock?.locked ? lock.reason : null,
        locked_at: lock?.locked ? lock.locked_at : null,
      };
    });

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

    const cleanedCode = cleanUniversityCode(dto.code);
    const codeValidation = validateUniversityCode(cleanedCode);
    if (!codeValidation.ok) {
      throw new UnprocessableEntityException(codeValidation.error);
    }

    const cleanedPrefix = cleanJupebPrefix(dto.jupeb_prefix);
    const prefixValidation = validateJupebPrefix(cleanedPrefix);
    if (!prefixValidation.ok) {
      throw new UnprocessableEntityException(prefixValidation.error);
    }

    // Check unique constraints
    const existingCode = await this.universityRepo.findByCode(cleanedCode);
    if (existingCode) {
      throw new ConflictException({
        message: 'University with this code already exists',
        details: { field: 'code', value: cleanedCode },
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
        code: cleanedCode,
        name: dto.name.trim(),
        shortName: dto.short_name ? dto.short_name.trim() : cleanedPrefix,
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

      // Emit in-memory event for instant single institution sync to CRMS & Attendance
      this.eventEmitter.emit(SyncEvent.INSTITUTION_UPDATED, {
        universityId: university.id,
        userId: createdBy,
        data: university,
      });

      return {
        ...university,
        jupeb_prefix: university.jupebPrefix,
        short_name: university.shortName,
        university_type: university.universityType,
        expected_candidate_count: university.expectedCandidateCount,
        institution_admin: admin.institution_admin,
      };
    } catch (err) {
      if (university?.id) {
        await this.universityRepo.softDelete(university.id).catch(() => {});
      }
      throw err;
    }
  }

  async patch(id: string, dto: PatchUniversityDto, userId?: string | null): Promise<UniversityEntity> {
    await this.getById(id);

    const fields: Partial<UniversityEntity> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.short_name !== undefined) fields.shortName = dto.short_name;
    if (dto.metadata !== undefined) fields.metadata = dto.metadata;
    if (dto.code !== undefined) {
      const cleanedCode = cleanUniversityCode(dto.code);
      const codeVal = validateUniversityCode(cleanedCode);
      if (!codeVal.ok) throw new UnprocessableEntityException(codeVal.error);
      fields.code = cleanedCode;
    }
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

    // Emit in-memory event for instant single institution sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.INSTITUTION_UPDATED, {
      universityId: id,
      userId,
      data: fields,
    });

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

    // Emit in-memory event for instant single institution sync to CRMS & Attendance
    this.eventEmitter.emit(SyncEvent.INSTITUTION_UPDATED, {
      universityId: id,
      userId,
      data: { status },
    });

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

    const seenCodes = new Map<string, number>();
    const seenPrefixes = new Map<string, number>();
    const seenEmails = new Map<string, number>();

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNumber = i + 1;

      // Extract all fields using aliases
      const rawName = (row.name || row.institution_name || row.university_name || row.institution || row.title || '').trim();
      const rawCode = (row.code || row.center_code || row.institution_code || row.university_code || row.inst_code || '').trim();
      const rawPrefix = (row.jupeb_prefix || row.prefix || row.jupeb_code || row.center_prefix || '').trim();
      const rawShortName = (row.short_name || row.shortname || row.acronym || row.abbr || row.abbreviation || '').trim();
      const rawEmail = (row.email || row.admin_email || row.contact_email || row.institution_email || '').trim();
      const rawType = (row.university_type || row.type || row.institution_type || row.category || '').trim();
      const rawExpected = (row.expected_candidate_count || row.quota || row.capacity || row.candidate_count || row.expected_candidates || '').trim();
      const rawPhone = (row.phone || row.phone_number || row.telephone || row.contact_phone || '').trim();
      const rawAddress = (row.address || row.location || '').trim();
      const rawState = (row.state || '').trim();
      const rawDescription = (row.description || '').trim();
      const rawAdminFirstName = (row.admin_first_name || row.first_name || row.admin_firstname || '').trim();
      const rawAdminLastName = (row.admin_last_name || row.last_name || row.admin_lastname || '').trim();

      // Smart resolution for code, jupeb_prefix, and short_name:
      // Inverted detection: If rawCode has letters (non-digits) and rawPrefix has digits, swap them!
      let codeCandidate = rawCode;
      let prefixCandidate = rawPrefix;
      let shortNameCandidate = rawShortName;

      if (rawCode && rawPrefix && !isPureDigits(rawCode) && isPureDigits(rawPrefix)) {
        codeCandidate = rawPrefix;
        prefixCandidate = rawCode;
        if (!shortNameCandidate) {
          shortNameCandidate = rawCode;
        }
      } else {
        if (!prefixCandidate && shortNameCandidate) {
          prefixCandidate = shortNameCandidate;
        }
      }

      // If prefix is still empty but we have a name, derive an acronym fallback
      if (!prefixCandidate && rawName) {
        const words = rawName.split(/\s+/).filter((w) => w.length > 0);
        if (words.length >= 2) {
          prefixCandidate = words
            .filter((w) => !['of', 'and', 'the', 'for', 'in', '&'].includes(w.toLowerCase()))
            .map((w) => w[0].toUpperCase())
            .join('')
            .slice(0, 10);
        }
        if (!prefixCandidate || prefixCandidate.length < 2) {
          prefixCandidate = rawName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase();
        }
      }
      if (!shortNameCandidate) {
        shortNameCandidate = prefixCandidate;
      }

      // --- Per-Row Validation Checks ---
      // 1. Name validation
      if (!rawName) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: 'Institution name is required',
        });
        failed += 1;
        continue;
      }
      if (rawName.length < 2) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: 'Institution name must be at least 2 characters',
        });
        failed += 1;
        continue;
      }

      // 2. Code validation (must be 3 digits, e.g. 001)
      if (!codeCandidate) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: 'Institution code is required (e.g. 001)',
        });
        failed += 1;
        continue;
      }
      const cleanedCode = cleanUniversityCode(codeCandidate);
      const codeValidation = validateUniversityCode(cleanedCode);
      if (!codeValidation.ok) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: codeValidation.error || 'Institution code must be exactly 3 numeric digits (e.g. 001)',
        });
        failed += 1;
        continue;
      }

      // 3. JUPEB prefix validation (2-20 characters)
      if (!prefixCandidate) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: 'JUPEB prefix is required (2-20 characters, e.g. UNILAG)',
        });
        failed += 1;
        continue;
      }
      const cleanedPrefix = cleanJupebPrefix(prefixCandidate);
      const prefixValidation = validateJupebPrefix(cleanedPrefix);
      if (!prefixValidation.ok) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: prefixValidation.error || 'JUPEB prefix must be between 2 and 20 characters',
        });
        failed += 1;
        continue;
      }

      // 4. Admin email validation
      if (!rawEmail) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: 'Admin email is required',
        });
        failed += 1;
        continue;
      }
      const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const cleanedEmail = rawEmail.toLowerCase();
      if (!EMAIL_RE.test(cleanedEmail)) {
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'validation_error',
          error_message: `Invalid email address format: "${rawEmail}"`,
        });
        failed += 1;
        continue;
      }

      // 5. University type validation
      let parsedType: any = undefined;
      if (rawType) {
        const normType = rawType.toLowerCase();
        if (!['federal', 'state', 'private'].includes(normType)) {
          outcomes.push({
            row: rowNumber,
            ok: false,
            error_code: 'validation_error',
            error_message: `Invalid university_type "${rawType}". Must be federal, state, or private`,
          });
          failed += 1;
          continue;
        }
        parsedType = normType;
      }

      // 6. Expected candidate count validation
      let parsedExpectedCount: number | undefined = undefined;
      if (rawExpected) {
        const num = Number(rawExpected);
        if (isNaN(num) || num < 0 || !Number.isInteger(num)) {
          outcomes.push({
            row: rowNumber,
            ok: false,
            error_code: 'validation_error',
            error_message: `expected_candidate_count must be a non-negative integer. Received: "${rawExpected}"`,
          });
          failed += 1;
          continue;
        }
        parsedExpectedCount = num;
      }

      // 7. In-batch duplicates validation
      if (seenCodes.has(cleanedCode)) {
        const firstRow = seenCodes.get(cleanedCode);
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'duplicate',
          error_message: `Duplicate code "${cleanedCode}" in CSV (first seen at row ${firstRow})`,
        });
        failed += 1;
        continue;
      }

      if (seenPrefixes.has(cleanedPrefix)) {
        const firstRow = seenPrefixes.get(cleanedPrefix);
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'duplicate',
          error_message: `Duplicate jupeb_prefix "${cleanedPrefix}" in CSV (first seen at row ${firstRow})`,
        });
        failed += 1;
        continue;
      }

      if (seenEmails.has(cleanedEmail)) {
        const firstRow = seenEmails.get(cleanedEmail);
        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: 'duplicate',
          error_message: `Duplicate admin email "${cleanedEmail}" in CSV (first seen at row ${firstRow})`,
        });
        failed += 1;
        continue;
      }

      seenCodes.set(cleanedCode, rowNumber);
      seenPrefixes.set(cleanedPrefix, rowNumber);
      seenEmails.set(cleanedEmail, rowNumber);

      // 8. Attempt creation in DB & provision admin
      try {
        const created = await this.create(
          {
            code: cleanedCode,
            name: rawName,
            short_name: shortNameCandidate ? shortNameCandidate.trim() : cleanedPrefix,
            jupeb_prefix: cleanedPrefix,
            university_type: parsedType,
            email: cleanedEmail,
            admin_first_name: rawAdminFirstName || undefined,
            admin_last_name: rawAdminLastName || undefined,
            address: rawAddress || undefined,
            phone: rawPhone || undefined,
            expected_candidate_count: parsedExpectedCount,
            description: rawDescription || undefined,
            metadata: rawState ? { state: rawState } : {},
          },
          createdBy,
        );
        outcomes.push({ row: rowNumber, ok: true, data: created });
        succeeded += 1;
      } catch (err: any) {
        let errorMessage = 'Failed to create institution';
        let errorCode = 'error';

        if (err instanceof ConflictException || err.status === 409 || err.code === '23505') {
          errorCode = 'duplicate';
        } else if (err instanceof UnprocessableEntityException || err.status === 422) {
          errorCode = 'validation_error';
        }

        if (typeof err?.response?.message === 'string') {
          errorMessage = err.response.message;
        } else if (Array.isArray(err?.response?.message)) {
          errorMessage = err.response.message.join('; ');
        } else if (typeof err?.response?.details?.message === 'string') {
          errorMessage = err.response.details.message;
        } else if (typeof err?.message === 'string' && err.message !== '[object Object]') {
          errorMessage = err.message;
        } else if (err?.detail) {
          errorMessage = err.detail;
        }

        if (/duplicate|conflict|already exists/i.test(errorMessage)) {
          errorCode = 'duplicate';
        }

        outcomes.push({
          row: rowNumber,
          ok: false,
          error_code: errorCode,
          error_message: errorMessage,
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

      const code = university.code || university.jupebPrefix || body.code;
      const name = university.name || body.name;
      const shortCode = university.shortName || university.jupebPrefix || body.short_name || body.shortCode || university.code;
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

      const institutionCode = university.code || university.jupebPrefix || body.code;
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
