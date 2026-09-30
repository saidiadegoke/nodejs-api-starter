import {
  Injectable,
  Inject,
  forwardRef,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { RegistrationRepository } from '../../registration/repositories/registration.repository';
import { RegistrationDocumentRepository } from '../../registration/repositories/registration-document.repository';
import { DocumentRequirementRepository } from '../../document-requirements/repositories/document-requirement.repository';
import { UserRepository } from '../../users/repositories/user.repository';
import { OcrService } from '../../ocr/services/ocr.service';
import {
  RegistrationDocumentStatus,
} from '../../registration/entities/registration-document.entity';
import {
  AttachDocumentDto,
  PatchDocumentDto,
} from '../dto';

const RESULT_REQUIREMENT_PATTERN = /^(waec|neco|nabteb|gce|jamb|olevel|result|primary_olevel|secondary_olevel)(_result)?$/i;
const ALLOWED_SOURCES = new Set(['waec', 'neco', 'nabteb', 'gce', 'jamb', 'other']);
const ROLE_MANAGE_REQ = new Set(['super_admin', 'admin', 'registrar']);
const ROLE_INST_REVIEW = new Set([
  'super_admin',
  'admin',
  'registrar',
  'program_director',
  'institution_admin',
]);

function isResultRequirementKey(key?: string): boolean {
  if (!key || typeof key !== 'string') return false;
  return RESULT_REQUIREMENT_PATTERN.test(key) || /(waec|neco|nabteb|gce|jamb|olevel)/i.test(key);
}

function inferSourceFromRequirementKey(key?: string): string | null {
  if (!key) return null;
  const m = String(key).toLowerCase().match(/(waec|neco|nabteb|gce|jamb)/);
  return m ? m[1] : null;
}

@Injectable()
export class SubmissionService {
  private readonly logger;

  constructor(
    private readonly regRepo: RegistrationRepository,
    private readonly docRepo: RegistrationDocumentRepository,
    private readonly reqRepo: DocumentRequirementRepository,
    private readonly userRepo: UserRepository,
    @Inject(forwardRef(() => OcrService))
    private readonly ocrService: OcrService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(SubmissionService.name);
  }

  private async getUserRoles(userId: string): Promise<string[]> {
    const roles = await this.userRepo.findUserRoles(userId);
    return roles.map((r) => r.role);
  }

  private async hasRoleIn(userId: string, set: Set<string>): Promise<boolean> {
    const roles = await this.getUserRoles(userId);
    return roles.some((r) => set.has(r));
  }

  private mimeAllowed(mime: string, allowed: string[]): boolean {
    if (!allowed || !allowed.length) return true;
    if (!mime) return false;
    const lower = mime.toLowerCase();
    for (const pattern of allowed) {
      const p = pattern.toLowerCase().trim();
      if (p === '*/*' || p === '*') return true;
      if (p.endsWith('/*')) {
        const prefix = p.slice(0, -1);
        if (lower.startsWith(prefix)) return true;
      }
      if (lower === p) return true;
    }
    return false;
  }

  private sizeAllowed(fileSizeBytes: number, maxMb?: number): boolean {
    if (!maxMb || maxMb <= 0) return true;
    const maxBytes = maxMb * 1024 * 1024;
    return fileSizeBytes <= maxBytes;
  }

  private validateSourceSitting(requirementKey?: string, source?: string, sitting?: number) {
    const isResult = isResultRequirementKey(requirementKey);
    const errors: Array<{ field: string; error_code: string }> = [];

    let normalizedSource = source ? String(source).toLowerCase().trim() : null;
    let normalizedSitting = sitting !== undefined && sitting !== null ? Number(sitting) : null;

    if (isResult) {
      if (!normalizedSource) {
        normalizedSource = inferSourceFromRequirementKey(requirementKey);
      }
      if (!normalizedSource) {
        errors.push({ field: 'source', error_code: 'source_required' });
      } else if (!ALLOWED_SOURCES.has(normalizedSource)) {
        errors.push({ field: 'source', error_code: 'source_invalid' });
      }
      if (normalizedSitting === null || Number.isNaN(normalizedSitting)) {
        errors.push({ field: 'sitting', error_code: 'sitting_required' });
      } else if (![1, 2].includes(normalizedSitting)) {
        errors.push({ field: 'sitting', error_code: 'sitting_invalid' });
      }
    } else {
      normalizedSource = null;
      normalizedSitting = null;
    }

    if (errors.length) {
      throw new UnprocessableEntityException({
        message: 'Document metadata invalid',
        details: { errors },
      });
    }

    return { source: normalizedSource, sitting: normalizedSitting };
  }

  private async resolveRegistrationForStudent(userId: string, registrationIdOpt?: string) {
    if (registrationIdOpt) {
      const reg = await this.regRepo.findById(registrationIdOpt);
      if (!reg) throw new NotFoundException('Registration not found');
      if (reg.userId && reg.userId !== userId) {
        const adminOk = await this.hasRoleIn(userId, ROLE_MANAGE_REQ);
        if (!adminOk) throw new ForbiddenException('Registration does not belong to current user');
      }
      return reg;
    }
    const reg = await this.regRepo.findLatestForUser(userId);
    if (!reg) throw new NotFoundException('No registration found for current user');
    if (!reg.userId || reg.userId !== userId) {
      const adminOk = await this.hasRoleIn(userId, ROLE_MANAGE_REQ);
      if (!adminOk) throw new ForbiddenException('Registration is not linked to your account');
    }
    return reg;
  }

  private async loadFileForUser(fileId: string, userId: string) {
    const rows = await this.dataSource.query(
      `SELECT id, uploaded_by, file_size, file_type, provider, provider_path, file_url, metadata, deleted_at FROM files WHERE id = $1`,
      [fileId],
    );
    const f = rows[0];
    if (!f || f.deleted_at) throw new NotFoundException('File not found');
    const adminOverride = await this.hasRoleIn(userId, ROLE_MANAGE_REQ);
    if (!adminOverride && f.uploaded_by !== userId) {
      throw new ForbiddenException('You do not own this file');
    }
    return f;
  }

  private async assertRequirementAndFile(requirementId: string, fileId: string, userId: string) {
    const reqRow = await this.reqRepo.findById(requirementId);
    if (!reqRow || reqRow.status !== 'active') {
      throw new NotFoundException('Requirement not found or inactive');
    }
    const file = await this.loadFileForUser(fileId, userId);
    const rawAllowed = reqRow.allowedMimeTypes;
    const allowed = Array.isArray(rawAllowed) ? rawAllowed : [];
    if (!this.mimeAllowed(file.file_type, allowed)) {
      throw new UnprocessableEntityException('File type is not allowed for this requirement');
    }
    if (!this.sizeAllowed(Number(file.file_size), reqRow.maxFileSizeMb)) {
      throw new UnprocessableEntityException('File exceeds maximum size for this requirement');
    }
    return { reqRow, file };
  }

  async getMeRequirements(userId: string, registrationIdOpt?: string) {
    const reg = await this.resolveRegistrationForStudent(userId, registrationIdOpt);
    const reqs = await this.reqRepo.findActiveForCompleteness();
    const docs = await this.docRepo.findByRegistration(reg.id);
    const satisfiedReqIds = new Set(
      docs
        .filter(
          (d) =>
            d.status === RegistrationDocumentStatus.SUBMITTED ||
            d.status === RegistrationDocumentStatus.ACCEPTED,
        )
        .map((d) => d.requirementId),
    );
    return reqs.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      description: r.description,
      is_mandatory: r.isMandatory,
      max_file_size_mb: r.maxFileSizeMb,
      allowed_mime_types: r.allowedMimeTypes,
      satisfied: satisfiedReqIds.has(r.id),
    }));
  }

  async listMeDocuments(userId: string, registrationIdOpt?: string) {
    const reg = await this.resolveRegistrationForStudent(userId, registrationIdOpt);
    return this.docRepo.findByRegistration(reg.id);
  }

  async downloadUrlMine(userId: string, documentId: string) {
    const row = await this.docRepo.findById(documentId);
    if (!row) throw new NotFoundException('Document not found');

    const reg = await this.regRepo.findById(row.registrationId);
    const owns = reg?.userId === userId;
    if (!owns) {
      const ok = await this.hasRoleIn(userId, ROLE_INST_REVIEW);
      if (!ok) throw new ForbiddenException('Forbidden');
    }
    if (!row.fileId) throw new NotFoundException('Document has no file');

    const fileRows = await this.dataSource.query(
      `SELECT id, provider, provider_path, file_url, file_type, metadata FROM files WHERE id = $1 AND deleted_at IS NULL`,
      [row.fileId],
    );
    const file = fileRows[0];
    if (!file) throw new NotFoundException('File record not found');

    const expiresInSec = parseInt(process.env.JUPEB_DOC_DOWNLOAD_TTL_SEC || '300', 10);
    const url = file.file_url || null;
    if (!url) throw new InternalServerErrorException('Could not produce a download URL');

    const metadata = typeof file.metadata === 'string' ? JSON.parse(file.metadata) : file.metadata;

    return {
      document_id: row.id,
      file_id: file.id,
      file_name: metadata?.original_name || file.provider_path || null,
      file_type: file.file_type,
      url,
      expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    };
  }

  async attachMeDocument(userId: string, body: AttachDocumentDto) {
    const { requirement_id, file_id, registration_id } = body;
    const reg = await this.resolveRegistrationForStudent(userId, registration_id);
    const { reqRow } = await this.assertRequirementAndFile(requirement_id, file_id, userId);

    const { source, sitting } = this.validateSourceSitting(
      reqRow.key,
      body.source,
      body.sitting,
    );

    if (source && sitting) {
      const sameTuple = await this.docRepo.findCurrentBySourceSitting(reg.id, source, sitting);
      if (sameTuple) {
        await this.docRepo.markReplaced(sameTuple.id);
      }
    } else {
      const existing = await this.docRepo.findCurrentSubmittedOrAccepted(reg.id, requirement_id);
      if (existing) {
        await this.docRepo.markReplaced(existing.id);
      }
    }

    const document = await this.docRepo.create({
      registrationId: reg.id,
      requirementId: requirement_id,
      fileId: file_id,
      status: RegistrationDocumentStatus.SUBMITTED,
      source,
      sitting,
      institutionType: body.institution_type,
    });

    const ocrJob = await this.dispatchOcrForDocument({
      document,
      requirement: reqRow,
      userId,
      registrationId: reg.id,
    });

    return ocrJob
      ? {
          ...document,
          ocr_job: ocrJob,
          ocr_result: ocrJob.result || null,
        }
      : document;
  }

  async patchMeDocument(userId: string, documentId: string, body: PatchDocumentDto) {
    const row = await this.docRepo.findById(documentId);
    if (!row) throw new NotFoundException('Document not found');
    const reg = await this.resolveRegistrationForStudent(userId, row.registrationId);
    if (reg.userId !== userId) {
      const ok = await this.hasRoleIn(userId, ROLE_MANAGE_REQ);
      if (!ok) throw new ForbiddenException('Forbidden');
    }
    if (row.status !== RegistrationDocumentStatus.SUBMITTED) {
      throw new UnprocessableEntityException('Only submitted documents can be replaced');
    }
    const { reqRow } = await this.assertRequirementAndFile(row.requirementId, body.file_id, userId);

    const { source, sitting } = this.validateSourceSitting(
      reqRow.key,
      body.source !== undefined ? body.source : (row.source || undefined),
      body.sitting !== undefined ? body.sitting : (row.sitting || undefined),
    );

    await this.docRepo.markReplaced(row.id);
    const document = await this.docRepo.create({
      registrationId: row.registrationId,
      requirementId: row.requirementId,
      fileId: body.file_id,
      status: RegistrationDocumentStatus.SUBMITTED,
      source,
      sitting,
      institutionType: body.institution_type !== undefined ? body.institution_type : row.institutionType,
    });

    const ocrJob = await this.dispatchOcrForDocument({
      document,
      requirement: reqRow,
      userId,
      registrationId: reg.id,
    });

    return ocrJob
      ? {
          ...document,
          ocr_job: ocrJob,
          ocr_result: ocrJob.result || null,
        }
      : document;
  }

  private async dispatchOcrForDocument({
    document,
    requirement,
    userId,
    registrationId,
  }: {
    document: any;
    requirement: any;
    userId: string;
    registrationId: string;
  }) {
    if (!document || !document.source || !document.sitting) return null;
    if (!requirement || !RESULT_REQUIREMENT_PATTERN.test(requirement.key)) return null;

    try {
      const { job, completedJob } = await this.ocrService.createJob({
        userId,
        fileId: document.fileId || document.file_id,
        examType: document.source && ['waec', 'neco', 'nabteb', 'gce'].includes(document.source)
          ? document.source
          : 'auto',
        context: 'submission',
        wait: true,
        metadata: {
          registration_id: registrationId,
          requirement_id: document.requirementId || document.requirement_id,
          document_id: document.id,
          source: document.source,
          sitting: document.sitting,
          created_by: userId,
        },
      });

      const finalJob = completedJob || job;
      let ocrResult: any = null;
      if (finalJob) {
        const fullJob = await this.ocrService.getJob(finalJob.id, userId).catch(() => null);
        ocrResult = fullJob?.result?.result_json || null;
      }

      return {
        id: finalJob.id,
        status: finalJob.status,
        result: ocrResult,
      };
    } catch (err: any) {
      this.logger.warn(`OCR immediate processing failed for document ${document.id}: ${err.message}`);
      return null;
    }
  }

  async deleteMyDocument(userId: string, documentId: string) {
    const row = await this.docRepo.findById(documentId);
    if (!row) throw new NotFoundException('Document not found');
    const reg = await this.regRepo.findById(row.registrationId);
    if (reg?.userId !== userId) {
      throw new ForbiddenException('Forbidden');
    }
    if (row.status !== RegistrationDocumentStatus.SUBMITTED) {
      throw new UnprocessableEntityException('Only submitted documents can be deleted');
    }

    return this.docRepo.markDeleted(row.id);
  }

  async validateCompleteness(userId: string, registrationIdOpt?: string) {
    const reg = await this.resolveRegistrationForStudent(userId, registrationIdOpt);
    const reqs = await this.reqRepo.findActiveForCompleteness();
    const mandatory = reqs.filter((r) => r.isMandatory);
    const docs = await this.docRepo.findByRegistration(reg.id);
    const satisfiedReqIds = new Set(
      docs
        .filter(
          (d) =>
            d.status === RegistrationDocumentStatus.SUBMITTED ||
            d.status === RegistrationDocumentStatus.ACCEPTED,
        )
        .map((d) => d.requirementId),
    );
    const missing_keys = mandatory.filter((r) => !satisfiedReqIds.has(r.id)).map((r) => r.key);
    return {
      registration_id: reg.id,
      complete: missing_keys.length === 0,
      missing_keys,
    };
  }

  async institutionListDocuments(userId: string, registrationId: string) {
    const ok = await this.hasRoleIn(userId, ROLE_INST_REVIEW);
    if (!ok) throw new ForbiddenException('Forbidden');
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    return this.docRepo.findByRegistration(registrationId);
  }

  async institutionReviewDocument(
    userId: string,
    documentId: string,
    status: 'accepted' | 'rejected',
    reviewNote?: string,
  ) {
    const ok = await this.hasRoleIn(userId, ROLE_INST_REVIEW);
    if (!ok) throw new ForbiddenException('Forbidden');
    const row = await this.docRepo.findById(documentId);
    if (!row) throw new NotFoundException('Document not found');
    if (row.status !== 'submitted') {
      throw new UnprocessableEntityException('Only submitted documents can be reviewed');
    }
    return this.docRepo.setReview(documentId, {
      status,
      reviewNote,
      reviewedBy: userId,
    });
  }
}
