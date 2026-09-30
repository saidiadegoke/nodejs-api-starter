import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PaymentItemRepository } from '../repositories/payment-item.repository';
import { PaymentStructureRepository } from '../repositories/payment-structure.repository';
import {
  CreatePaymentItemDto,
  PatchPaymentItemDto,
  CreatePaymentStructureDto,
  PatchPaymentStructureDto,
  ListPaymentCatalogQueryDto,
} from '../dtos/payment-catalog.dto';
import { PaymentItemEntity } from '../entities/payment-item.entity';
import { PaymentStructureEntity } from '../entities/payment-structure.entity';
import { CommodLogger, LoggerFactory } from '../../../logger';

@Injectable()
export class PaymentCatalogService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly itemRepo: PaymentItemRepository,
    private readonly structureRepo: PaymentStructureRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(PaymentCatalogService.name);
  }

  // Active items for fee checkout UI
  async listActiveItems(): Promise<PaymentItemEntity[]> {
    return this.itemRepo.listActive();
  }

  async listActiveStructures(): Promise<PaymentStructureEntity[]> {
    return this.structureRepo.listActive();
  }

  // Admin Items
  async listAllItems(
    query: ListPaymentCatalogQueryDto,
  ): Promise<{ rows: PaymentItemEntity[]; page: number; limit: number; total: number }> {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const [rows, total] = await this.itemRepo.listAll({
      limit: safeLimit,
      offset,
      status: query.status,
      q: query.q,
    });

    return { rows, page: safePage, limit: safeLimit, total };
  }

  async createItem(dto: CreatePaymentItemDto): Promise<PaymentItemEntity> {
    if (!dto.code || !dto.name) {
      throw new UnprocessableEntityException('code and name are required');
    }

    const existing = await this.itemRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException({
        message: 'Payment item with this code already exists',
        details: { field: 'code', value: dto.code },
      });
    }

    return this.itemRepo.create({
      code: dto.code.trim().toLowerCase(),
      name: dto.name.trim(),
      description: dto.description || null,
      feeSource: (dto.fee_source as any) || 'fixed',
      fixedAmount: dto.fixed_amount != null ? Number(dto.fixed_amount) : null,
      isActive: dto.is_active !== false,
      sortOrder: dto.sort_order || 0,
    });
  }

  async updateItem(id: string, dto: PatchPaymentItemDto): Promise<PaymentItemEntity> {
    const existing = await this.itemRepo.findById(id);
    if (!existing) throw new NotFoundException('Payment item not found');

    const fields: Partial<PaymentItemEntity> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.fee_source !== undefined) fields.feeSource = dto.fee_source as any;
    if (dto.fixed_amount !== undefined) fields.fixedAmount = dto.fixed_amount != null ? Number(dto.fixed_amount) : null;
    if (dto.is_active !== undefined) fields.isActive = dto.is_active;
    if (dto.sort_order !== undefined) fields.sortOrder = Number(dto.sort_order);

    const updated = await this.itemRepo.updateById(id, fields);
    if (!updated) throw new NotFoundException('Payment item not found');
    return updated;
  }

  async deleteItem(id: string): Promise<PaymentItemEntity> {
    const deleted = await this.itemRepo.softDelete(id);
    if (!deleted) throw new NotFoundException('Payment item not found');
    return deleted;
  }

  // Admin Structures
  async listAllStructures(
    query: ListPaymentCatalogQueryDto,
  ): Promise<{ rows: PaymentStructureEntity[]; page: number; limit: number; total: number }> {
    const safePage = Math.max(1, Number(query.page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (safePage - 1) * safeLimit;

    const [rows, total] = await this.structureRepo.listAll({
      limit: safeLimit,
      offset,
      status: query.status,
      q: query.q,
    });

    return { rows, page: safePage, limit: safeLimit, total };
  }

  async createStructure(dto: CreatePaymentStructureDto): Promise<PaymentStructureEntity> {
    if (!dto.code || !dto.name) {
      throw new UnprocessableEntityException('code and name are required');
    }

    const existing = await this.structureRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException({
        message: 'Payment structure with this code already exists',
        details: { field: 'code', value: dto.code },
      });
    }

    return this.structureRepo.create({
      code: dto.code.trim().toLowerCase(),
      name: dto.name.trim(),
      description: dto.description || null,
      allowsPartial: dto.allows_partial === true,
      isActive: dto.is_active !== false,
      sortOrder: dto.sort_order || 0,
    });
  }

  async updateStructure(
    id: string,
    dto: PatchPaymentStructureDto,
  ): Promise<PaymentStructureEntity> {
    const existing = await this.structureRepo.findById(id);
    if (!existing) throw new NotFoundException('Payment structure not found');

    const fields: Partial<PaymentStructureEntity> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.allows_partial !== undefined) fields.allowsPartial = dto.allows_partial;
    if (dto.is_active !== undefined) fields.isActive = dto.is_active;
    if (dto.sort_order !== undefined) fields.sortOrder = Number(dto.sort_order);

    const updated = await this.structureRepo.updateById(id, fields);
    if (!updated) throw new NotFoundException('Payment structure not found');
    return updated;
  }

  async deleteStructure(id: string): Promise<PaymentStructureEntity> {
    const deleted = await this.structureRepo.softDelete(id);
    if (!deleted) throw new NotFoundException('Payment structure not found');
    return deleted;
  }
}
