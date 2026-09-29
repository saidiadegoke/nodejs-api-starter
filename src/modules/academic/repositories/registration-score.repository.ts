import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationScoreEntity } from '../entities/registration-score.entity';

@Injectable()
export class RegistrationScoreRepository {
  constructor(
    @InjectRepository(RegistrationScoreEntity)
    private readonly repo: Repository<RegistrationScoreEntity>,
  ) {}

  async findByRegistrationId(registrationId: string): Promise<RegistrationScoreEntity | null> {
    return this.repo.findOne({ where: { registrationId } });
  }

  async upsertSnapshot(data: {
    registrationId: string;
    passedCoursesCount: number;
    failedCoursesCount: number;
    plusOneTotal: number;
  }): Promise<RegistrationScoreEntity> {
    const existing = await this.repo.findOne({
      where: { registrationId: data.registrationId },
    });

    if (existing) {
      existing.passedCoursesCount = data.passedCoursesCount;
      existing.failedCoursesCount = data.failedCoursesCount;
      existing.plusOneTotal = data.plusOneTotal;
      existing.computedAt = new Date();
      existing.updatedAt = new Date();
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      registrationId: data.registrationId,
      passedCoursesCount: data.passedCoursesCount,
      failedCoursesCount: data.failedCoursesCount,
      plusOneTotal: data.plusOneTotal,
      computedAt: new Date(),
    });
    return this.repo.save(created);
  }
}
