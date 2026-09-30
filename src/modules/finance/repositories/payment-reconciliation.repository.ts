import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentReconciliationEntity } from '../entities/payment-reconciliation.entity';

@Injectable()
export class PaymentReconciliationRepository {
  constructor(
    @InjectRepository(PaymentReconciliationEntity)
    private readonly repo: Repository<PaymentReconciliationEntity>,
  ) {}

  async findById(id: string): Promise<PaymentReconciliationEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRegistrationId(registrationId: string): Promise<PaymentReconciliationEntity[]> {
    return this.repo.find({
      where: { registrationId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(data: Partial<PaymentReconciliationEntity>): Promise<PaymentReconciliationEntity> {
    const item = this.repo.create(data);
    return this.repo.save(item);
  }
}
