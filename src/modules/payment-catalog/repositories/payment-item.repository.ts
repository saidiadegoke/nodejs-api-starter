import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { PaymentItemEntity } from '../entities/payment-item.entity';

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
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async findByCode(code: string): Promise<PaymentItemEntity | null> {
    return this.repo.findOne({
      where: { code: ILike(String(code).trim()), deletedAt: IsNull() },
    });
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
