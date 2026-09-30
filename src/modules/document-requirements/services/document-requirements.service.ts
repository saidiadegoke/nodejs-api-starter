import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DocumentRequirementRepository } from '../repositories/document-requirement.repository';
import { DocumentRequirementEntity } from '../entities/document-requirement.entity';
import {
  CreateDocumentRequirementDto,
  PatchDocumentRequirementDto,
  ListDocumentRequirementsQueryDto,
} from '../dtos/document-requirement.dto';
import { CommodLogger, LoggerFactory } from '../../../logger';

@Injectable()
export class DocumentRequirementsService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly docReqRepo: DocumentRequirementRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(DocumentRequirementsService.name);
  }

  async listActive(): Promise<DocumentRequirementEntity[]> {
    return this.docReqRepo.findActiveForCompleteness();
  }

  async listAdmin(
    query: ListDocumentRequirementsQueryDto,
  ): Promise<{ rows: DocumentRequirementEntity[]; page: number; limit: number; total: number }> {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const [rows, total] = await this.docReqRepo.findAll({
      limit: safeLimit,
      offset,
      status: query.status,
    });

    return { rows, page: safePage, limit: safeLimit, total };
  }

  async getById(id: string): Promise<DocumentRequirementEntity> {
    if (!id) throw new UnprocessableEntityException('Invalid requirement id');
    const row = await this.docReqRepo.findById(id);
    if (!row) throw new NotFoundException('Document requirement not found');
    return row;
  }

  async create(dto: CreateDocumentRequirementDto): Promise<DocumentRequirementEntity> {
    if (!dto.key || !dto.title) {
      throw new UnprocessableEntityException('key and title are required');
    }

    const existing = await this.docReqRepo.findByKey(dto.key);
    if (existing) {
      throw new ConflictException({
        message: 'Document requirement with this key already exists',
        details: { field: 'key', value: dto.key },
      });
    }

    return this.docReqRepo.create({
      key: dto.key,
      title: dto.title,
      description: dto.description || null,
      isMandatory: dto.is_mandatory !== false,
      allowedMimeTypes: dto.allowed_mime_types || [],
      maxFileSizeMb: dto.max_file_size_mb != null ? Number(dto.max_file_size_mb) : 10,
      status: (dto.status as any) || 'active',
    });
  }

  async patch(id: string, dto: PatchDocumentRequirementDto): Promise<DocumentRequirementEntity> {
    await this.getById(id);

    const fields: Partial<DocumentRequirementEntity> = {};
    if (dto.title !== undefined) fields.title = dto.title;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.is_mandatory !== undefined) fields.isMandatory = dto.is_mandatory;
    if (dto.allowed_mime_types !== undefined) fields.allowedMimeTypes = dto.allowed_mime_types;
    if (dto.max_file_size_mb !== undefined) fields.maxFileSizeMb = Number(dto.max_file_size_mb);
    if (dto.status !== undefined) fields.status = dto.status === 'active' ? 'active' : 'inactive';

    const updated = await this.docReqRepo.updateById(id, fields);
    if (!updated) throw new NotFoundException('Document requirement not found');
    return updated;
  }

  async setStatus(id: string, status: 'active' | 'inactive'): Promise<DocumentRequirementEntity> {
    await this.getById(id);
    const updated = await this.docReqRepo.setStatus(id, status);
    if (!updated) throw new NotFoundException('Document requirement not found');
    return updated;
  }
}
