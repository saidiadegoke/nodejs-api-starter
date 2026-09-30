import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NextOfKinEntity } from '../entities/next-of-kin.entity';

@Injectable()
export class NextOfKinRepository {
  constructor(
    @InjectRepository(NextOfKinEntity)
    private readonly repo: Repository<NextOfKinEntity>,
  ) {}

  async findActiveByRegistration(registrationId: string): Promise<NextOfKinEntity | null> {
    return this.repo.findOne({
      where: { registrationId },
      order: { createdAt: 'DESC' },
    });
  }

  async findHistoryByRegistration(registrationId: string): Promise<NextOfKinEntity[]> {
    return this.repo.find({
      where: { registrationId },
      withDeleted: true,
      order: { createdAt: 'DESC' },
    });
  }

  async create(data: Partial<NextOfKinEntity>): Promise<NextOfKinEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async softDeleteByRegistration(registrationId: string): Promise<void> {
    await this.repo.softDelete({ registrationId });
  }
}
