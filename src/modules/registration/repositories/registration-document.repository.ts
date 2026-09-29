import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RegistrationDocumentEntity,
  RegistrationDocumentStatus,
} from '../entities/registration-document.entity';

@Injectable()
export class RegistrationDocumentRepository {
  constructor(
    @InjectRepository(RegistrationDocumentEntity)
    private readonly repo: Repository<RegistrationDocumentEntity>,
  ) {}

  async findById(id: string): Promise<RegistrationDocumentEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRegistrationId(registrationId: string): Promise<RegistrationDocumentEntity[]> {
    return this.repo.find({
      where: { registrationId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByRegistration(registrationId: string): Promise<RegistrationDocumentEntity[]> {
    return this.findByRegistrationId(registrationId);
  }

  async findActiveByRegistrationAndRequirement(
    registrationId: string,
    requirementId: string,
  ): Promise<RegistrationDocumentEntity | null> {
    return this.repo
      .createQueryBuilder('d')
      .where('d.registration_id = :registrationId', { registrationId })
      .andWhere('d.requirement_id = :requirementId', { requirementId })
      .andWhere('d.status IN (:...activeStatuses)', {
        activeStatuses: [
          RegistrationDocumentStatus.SUBMITTED,
          RegistrationDocumentStatus.ACCEPTED,
        ],
      })
      .getOne();
  }

  async findCurrentSubmittedOrAccepted(
    registrationId: string,
    requirementId: string,
  ): Promise<RegistrationDocumentEntity | null> {
    return this.repo
      .createQueryBuilder('d')
      .where('d.registration_id = :registrationId', { registrationId })
      .andWhere('d.requirement_id = :requirementId', { requirementId })
      .andWhere('d.status IN (:...activeStatuses)', {
        activeStatuses: [
          RegistrationDocumentStatus.SUBMITTED,
          RegistrationDocumentStatus.ACCEPTED,
        ],
      })
      .orderBy('d.created_at', 'DESC')
      .getOne();
  }

  async findCurrentBySourceSitting(
    registrationId: string,
    source: string,
    sitting: number,
  ): Promise<RegistrationDocumentEntity | null> {
    return this.repo
      .createQueryBuilder('d')
      .where('d.registration_id = :registrationId', { registrationId })
      .andWhere('d.source = :source', { source })
      .andWhere('d.sitting = :sitting', { sitting })
      .andWhere('d.status IN (:...activeStatuses)', {
        activeStatuses: [
          RegistrationDocumentStatus.SUBMITTED,
          RegistrationDocumentStatus.ACCEPTED,
        ],
      })
      .orderBy('d.created_at', 'DESC')
      .getOne();
  }

  async create(data: Partial<RegistrationDocumentEntity>): Promise<RegistrationDocumentEntity> {
    const doc = this.repo.create(data);
    return this.repo.save(doc);
  }

  async markReplaced(id: string): Promise<void> {
    await this.repo.update(id, {
      status: RegistrationDocumentStatus.REPLACED,
      updatedAt: new Date(),
    });
  }

  async markDeleted(id: string): Promise<RegistrationDocumentEntity | null> {
    await this.repo.update(id, {
      status: RegistrationDocumentStatus.DELETED,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async setReview(
    id: string,
    review: { status: RegistrationDocumentStatus | string; reviewNote?: string; reviewedBy?: string },
  ): Promise<RegistrationDocumentEntity | null> {
    await this.repo.update(id, {
      status: review.status as RegistrationDocumentStatus,
      reviewNote: review.reviewNote || null,
      reviewedBy: review.reviewedBy || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async setStatus(
    id: string,
    status: RegistrationDocumentStatus,
    reviewNote?: string | null,
    reviewedBy?: string | null,
  ): Promise<RegistrationDocumentEntity | null> {
    await this.repo.update(id, {
      status,
      reviewNote: reviewNote || null,
      reviewedBy: reviewedBy || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    });
    return this.findById(id);
  }
}
