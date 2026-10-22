import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentEntity } from '../entities/payment.entity';

@Injectable()
export class PaymentRepository {
  constructor(
    @InjectRepository(PaymentEntity)
    private readonly repo: Repository<PaymentEntity>,
  ) {}

  async findById(id: string): Promise<PaymentEntity | null> {
    try {
      return await this.repo.findOne({ where: { id } });
    } catch {
      return null;
    }
  }

  async findByPaymentId(paymentId: string): Promise<PaymentEntity | null> {
    return this.repo.findOne({ where: { paymentId } });
  }

  async findByTransactionRef(transactionRef: string): Promise<PaymentEntity | null> {
    return this.repo.findOne({ where: { transactionRef } });
  }

  async create(data: Partial<PaymentEntity>): Promise<PaymentEntity> {
    const payment = this.repo.create(data);
    return this.repo.save(payment);
  }

  async updateById(id: string, fields: Partial<PaymentEntity>): Promise<PaymentEntity | null> {
    await this.repo.update(id, { ...fields, updatedAt: new Date() });
    return this.findById(id);
  }

  async findByRegistrationId(registrationId: string): Promise<PaymentEntity[]> {
    return this.repo.find({
      where: { registrationId },
      order: { createdAt: 'DESC' },
    });
  }
}
