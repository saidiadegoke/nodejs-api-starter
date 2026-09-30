import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, ILike } from 'typeorm';
import { PaymentStructureEntity } from '../entities/payment-structure.entity';

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
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }

  async findByCode(code: string): Promise<PaymentStructureEntity | null> {
    return this.repo.findOne({
      where: { code: ILike(String(code).trim()), deletedAt: IsNull() },
    });
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
