import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BiometricCaptureEntity } from '../entities/biometric-capture.entity';

@Injectable()
export class BiometricCaptureRepository {
  constructor(
    @InjectRepository(BiometricCaptureEntity)
    private readonly repo: Repository<BiometricCaptureEntity>,
  ) {}

  async create(data: Partial<BiometricCaptureEntity>): Promise<BiometricCaptureEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<BiometricCaptureEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findWithRegistrationDetails(id: string): Promise<any | null> {
    const r = await this.repo
      .createQueryBuilder('b')
      .innerJoin('jupeb_registrations', 'r', 'r.id = b.registration_id')
      .select([
        'b.id AS id',
        'b.registration_id AS registration_id',
        'b.capture_type AS capture_type',
        'b.file_id AS file_id',
        'b.external_reference AS external_reference',
        'b.quality_score AS quality_score',
        'b.device_metadata AS device_metadata',
        'b.captured_at AS captured_at',
        'b.replaced_at AS replaced_at',
        'b.created_at AS created_at',
        'r.user_id AS registration_user_id',
        'r.university_id AS registration_university_id',
      ])
      .where('b.id = :id', { id })
      .getRawOne();

    return r || null;
  }

  async findByRegistrationId(registrationId: string): Promise<BiometricCaptureEntity[]> {
    return this.repo.find({
      where: { registrationId },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteById(id: string): Promise<BiometricCaptureEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.repo.delete(id);
    return existing;
  }

  async markReplaced(id: string): Promise<BiometricCaptureEntity | null> {
    const existing = await this.findById(id);
    if (!existing || existing.replacedAt) return existing;

    existing.replacedAt = new Date();
    return this.repo.save(existing);
  }
}
