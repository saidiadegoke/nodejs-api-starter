import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  RegistrationEntity,
  RegistrationStatus,
} from '../../registration/entities/registration.entity';
import { UniversityEntity } from '../../institutions/entities/university.entity';
import { BiometricCaptureEntity } from '../../identity/entities/biometric-capture.entity';

@Injectable()
export class SessionRegistrationRepository {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly repo: Repository<RegistrationEntity>,
  ) {}

  private repoFor(manager?: EntityManager): Repository<RegistrationEntity> {
    return manager ? manager.getRepository(RegistrationEntity) : this.repo;
  }

  countAll(sessionId: string): Promise<number> {
    return this.repo.count({ where: { sessionId } });
  }

  countByStatus(sessionId: string, status: RegistrationStatus): Promise<number> {
    return this.repo.count({ where: { sessionId, status } });
  }

  async countInstitutions(sessionId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('r')
      .select('COUNT(DISTINCT r.universityId)', 'count')
      .where('r.sessionId = :sessionId', { sessionId })
      .andWhere('r.universityId IS NOT NULL')
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  async countSubjectCombinations(sessionId: string): Promise<number> {
    const row = await this.repo
      .createQueryBuilder('r')
      .select('COUNT(DISTINCT r.subjectCombinationId)', 'count')
      .where('r.sessionId = :sessionId', { sessionId })
      .andWhere('r.subjectCombinationId IS NOT NULL')
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  async countGroupedByStatus(sessionId: string): Promise<Record<string, number>> {
    const rows = await this.repo
      .createQueryBuilder('r')
      .select('r.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('r.sessionId = :sessionId', { sessionId })
      .groupBy('r.status')
      .getRawMany<{ status: string; count: string }>();
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
  }

  /** Registrations that have at least one active (non-replaced) biometric capture. */
  async countWithActiveBiometrics(
    sessionId: string,
    options: { excludeWithdrawn?: boolean } = {},
  ): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('r')
      .innerJoin(
        BiometricCaptureEntity,
        'bc',
        'bc.registrationId = r.id AND bc.replacedAt IS NULL',
      )
      .select('COUNT(DISTINCT r.id)', 'count')
      .where('r.sessionId = :sessionId', { sessionId });

    if (options.excludeWithdrawn) {
      qb.andWhere('r.status <> :withdrawn', { withdrawn: RegistrationStatus.WITHDRAWN });
    }

    const row = await qb.getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }

  /** Approved registrations still waiting for a candidate number, in assignment order. */
  async findApprovedWithoutCandidateNumber(
    sessionId: string,
    manager?: EntityManager,
  ): Promise<Array<{ id: string; universityId: string; jupebPrefix: string }>> {
    return this.repoFor(manager)
      .createQueryBuilder('r')
      .innerJoin(UniversityEntity, 'u', 'u.id = r.universityId')
      .select([
        'r.id AS id',
        'r.universityId AS "universityId"',
        'u.jupebPrefix AS "jupebPrefix"',
      ])
      .where('r.sessionId = :sessionId', { sessionId })
      .andWhere('r.status = :status', { status: RegistrationStatus.APPROVED })
      .andWhere('r.jupebCandidateNumber IS NULL')
      .orderBy('r.approvedAt', 'ASC')
      .addOrderBy('r.createdAt', 'ASC')
      .getRawMany<{ id: string; universityId: string; jupebPrefix: string }>();
  }

  /** How many candidate numbers each university already has in this session. */
  async countNumberedByUniversity(
    sessionId: string,
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    const rows = await this.repoFor(manager)
      .createQueryBuilder('r')
      .select('r.universityId', 'universityId')
      .addSelect('COUNT(*)', 'count')
      .where('r.sessionId = :sessionId', { sessionId })
      .andWhere('r.jupebCandidateNumber IS NOT NULL')
      .groupBy('r.universityId')
      .getRawMany<{ universityId: string; count: string }>();
    return new Map(rows.map((r) => [r.universityId, Number(r.count)]));
  }

  async assignCandidateNumbers(
    updates: Pick<RegistrationEntity, 'id' | 'jupebCandidateNumber'>[],
    manager: EntityManager,
  ): Promise<void> {
    if (updates.length === 0) return;
    for (const update of updates) {
      await manager
        .createQueryBuilder()
        .update(RegistrationEntity)
        .set({
          jupebCandidateNumber: update.jupebCandidateNumber,
          updatedAt: new Date(),
        })
        .where('id = :id', { id: update.id })
        .execute();
    }
  }
}
