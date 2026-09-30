import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InstitutionSessionResultEntity } from '../entities/institution-session-result.entity';

@Injectable()
export class InstitutionSessionResultRepository {
  constructor(
    @InjectRepository(InstitutionSessionResultEntity)
    private readonly repo: Repository<InstitutionSessionResultEntity>,
  ) {}

  async findBySessionAndUniversity(
    sessionId: string,
    universityId: string,
  ): Promise<InstitutionSessionResultEntity | null> {
    return this.repo.findOne({
      where: { sessionId, universityId },
    });
  }

  async upsertInstitutionRelease(
    sessionId: string,
    universityId: string,
    released: boolean,
    userId?: string | null,
  ): Promise<InstitutionSessionResultEntity> {
    const existing = await this.findBySessionAndUniversity(sessionId, universityId);

    if (existing) {
      existing.resultsReleasedToStudents = released;
      existing.studentsResultsReleasedAt = released ? new Date() : null;
      existing.releasedBy = userId || null;
      existing.updatedAt = new Date();
      return this.repo.save(existing);
    }

    const created = this.repo.create({
      sessionId,
      universityId,
      resultsReleasedToStudents: released,
      studentsResultsReleasedAt: released ? new Date() : null,
      releasedBy: userId || null,
    });
    return this.repo.save(created);
  }
}
