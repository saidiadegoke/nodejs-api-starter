import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { PaymentItemEntity } from '../entities/payment-item.entity';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class PaymentItemRepository {
  constructor(
    @InjectRepository(PaymentItemEntity)
    private readonly repo: Repository<PaymentItemEntity>,
  ) {}

  async create(data: Partial<PaymentItemEntity>): Promise<PaymentItemEntity> {
    const item = this.repo.create(data);
    return this.repo.save(item);
  }

  async findById(id: string): Promise<PaymentItemEntity | null> {
    if (!id || !UUID_REGEX.test(String(id).trim())) return null;
    return this.repo.findOne({ where: { id: String(id).trim(), deletedAt: IsNull() } });
  }

  async findByCode(code: string): Promise<PaymentItemEntity | null> {
    if (!code) return null;
    const cleanCode = String(code).trim().toLowerCase();

    // 1. Direct match
    let item = await this.repo.findOne({
      where: { code: ILike(cleanCode), deletedAt: IsNull() },
    });
    if (item) return item;

    // 2. Normalize variations
    const variations: string[] = [];
    if (cleanCode.includes('affil') || cleanCode.includes('affliat')) {
      variations.push('fee_affiliation', 'affiliation_fee', 'affiliation');
    } else if (cleanCode.includes('exam')) {
      variations.push('fee_examination', 'examination_fee', 'examination', 'exam_fee');
    } else {
      variations.push(`fee_${cleanCode}`, cleanCode.replace(/^fee_/, ''), `${cleanCode}_fee`);
    }

    for (const v of variations) {
      item = await this.repo.findOne({
        where: { code: ILike(v), deletedAt: IsNull() },
      });
      if (item) return item;
    }

    // 3. Name search fallback
    return this.repo
      .createQueryBuilder('pi')
      .where('pi.deleted_at IS NULL')
      .andWhere('(pi.code ILIKE :term OR pi.name ILIKE :term)', { term: `%${cleanCode}%` })
      .orderBy('pi.sort_order', 'ASC')
      .getOne();
  }

  async listActive(): Promise<PaymentItemEntity[]> {
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
  }): Promise<[PaymentItemEntity[], number]> {
    const qb = this.repo.createQueryBuilder('pi').where('pi.deleted_at IS NULL');

    if (options.status === 'active') {
      qb.andWhere('pi.is_active = true');
    } else if (options.status === 'inactive') {
      qb.andWhere('pi.is_active = false');
    }

    if (options.q && options.q.trim()) {
      const term = `%${options.q.trim()}%`;
      qb.andWhere('(pi.code ILIKE :term OR pi.name ILIKE :term)', { term });
    }

    return qb
      .orderBy('pi.sort_order', 'ASC')
      .addOrderBy('pi.name', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  async updateById(
    id: string,
    fields: Partial<PaymentItemEntity>,
  ): Promise<PaymentItemEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, fields);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<PaymentItemEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.repo.softDelete(id);
    return existing;
  }
}
