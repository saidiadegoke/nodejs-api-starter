import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationStatusHistoryEntity } from '../entities/registration-status-history.entity';

@Injectable()
export class RegistrationStatusHistoryRepository {
  constructor(
    @InjectRepository(RegistrationStatusHistoryEntity)
    private readonly repo: Repository<RegistrationStatusHistoryEntity>,
  ) {}

  async create(data: Partial<RegistrationStatusHistoryEntity>): Promise<RegistrationStatusHistoryEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRegistrationId(registrationId: string): Promise<RegistrationStatusHistoryEntity[]> {
    return this.repo.find({
      where: { registrationId },
      order: { createdAt: 'DESC' },
    });
  }
}
