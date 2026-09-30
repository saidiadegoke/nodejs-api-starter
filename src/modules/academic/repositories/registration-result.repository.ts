import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegistrationResultEntity } from '../entities/registration-result.entity';

@Injectable()
export class RegistrationResultRepository {
  constructor(
    @InjectRepository(RegistrationResultEntity)
    private readonly repo: Repository<RegistrationResultEntity>,
  ) {}

  async findByRegistrationId(registrationId: string): Promise<RegistrationResultEntity[]> {
    return this.repo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.course', 'c')
      .where('r.registration_id = :registrationId', { registrationId })
      .orderBy('c.code', 'ASC')
      .getMany();
  }

  async upsertRow(data: {
    registrationId: string;
    courseId: string;
    grade: string;
    plusOneAwarded: boolean;
    enteredBy?: string | null;
  }): Promise<RegistrationResultEntity> {
    const existing = await this.repo.findOne({
      where: {
        registrationId: data.registrationId,
        courseId: data.courseId,
      },
    });

    if (existing) {
      existing.grade = data.grade;
      existing.plusOneAwarded = data.plusOneAwarded;
      existing.enteredBy = data.enteredBy || null;
      existing.enteredAt = new Date();
      existing.updatedAt = new Date();
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      registrationId: data.registrationId,
      courseId: data.courseId,
      grade: data.grade,
      plusOneAwarded: data.plusOneAwarded,
      enteredBy: data.enteredBy || null,
      enteredAt: new Date(),
    });
    return this.repo.save(created);
  }
}
