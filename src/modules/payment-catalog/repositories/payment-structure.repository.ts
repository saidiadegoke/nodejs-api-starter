import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { PaymentStructureEntity } from '../entities/payment-structure.entity';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymentStructureRepository {
  constructor(
    @InjectRepository(PaymentStructureEntity)
    private readonly repo: Repository<PaymentStructureEntity>,
  ) {}

  async create(data: Partial<PaymentStructureEntity>): Promise<PaymentStructureEntity> {
    const structure = this.repo.create(data);
    return this.repo.save(structure);
  }

  async findById(id: string): Promise<PaymentStructureEntity | null> {
    if (!id || !UUID_REGEX.test(String(id).trim())) return null;
    return this.repo.findOne({ where: { id: String(id).trim(), deletedAt: IsNull() } });
  }

  async findByCode(code: string): Promise<PaymentStructureEntity | null> {
    if (!code) return null;
    const cleanCode = String(code).trim().toLowerCase();

    // 1. Direct match
    let struct = await this.repo.findOne({
      where: { code: ILike(cleanCode), deletedAt: IsNull() },
    });
    if (struct) return struct;

    // 2. Variations
    const variations: string[] = [];
    if (cleanCode.includes('full')) {
      variations.push('struct_full', 'full', 'full_payment');
    } else if (cleanCode.includes('install') || cleanCode.includes('part')) {
      variations.push('struct_installment', 'installment', 'partial');
    } else if (cleanCode.includes('student')) {
      variations.push('struct_per_student', 'per_student');
    } else {
      variations.push(`struct_${cleanCode}`, cleanCode.replace(/^struct_/, ''));
    }

    for (const v of variations) {
      struct = await this.repo.findOne({
        where: { code: ILike(v), deletedAt: IsNull() },
      });
      if (struct) return struct;
    }

    // 3. Name search fallback
    return this.repo
      .createQueryBuilder('ps')
      .where('ps.deleted_at IS NULL')
      .andWhere('(ps.code ILIKE :term OR ps.name ILIKE :term)', { term: `%${cleanCode}%` })
      .orderBy('ps.sort_order', 'ASC')
      .getOne();
  }

  async listActive(): Promise<PaymentStructureEntity[]> {
    return this.repo.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async listAll(options: {
    limit: number;
    offset: number;
    status?: string;
    q?: string;
  }): Promise<[PaymentStructureEntity[], number]> {
    const qb = this.repo.createQueryBuilder('ps').where('ps.deleted_at IS NULL');

    if (options.status === 'active') {
      qb.andWhere('ps.is_active = true');
    } else if (options.status === 'inactive') {
      qb.andWhere('ps.is_active = false');
    }

    if (options.q && options.q.trim()) {
      const term = `%${options.q.trim()}%`;
      qb.andWhere('(ps.code ILIKE :term OR ps.name ILIKE :term)', { term });
    }

    return qb
      .orderBy('ps.sort_order', 'ASC')
      .addOrderBy('ps.name', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  async updateById(
    id: string,
    fields: Partial<PaymentStructureEntity>,
  ): Promise<PaymentStructureEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, fields);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<PaymentStructureEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.repo.softDelete(id);
    return existing;
  }
}
