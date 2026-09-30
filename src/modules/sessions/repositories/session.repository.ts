import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AcademicSessionEntity, SessionStatus } from '../entities/academic-session.entity';

export interface FindSessionsFilter {
  limit: number;
  offset: number;
  status?: string;
  q?: string;
}

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(AcademicSessionEntity)
    private readonly repo: Repository<AcademicSessionEntity>,
  ) {}

  private repoFor(manager?: EntityManager): Repository<AcademicSessionEntity> {
    return manager ? manager.getRepository(AcademicSessionEntity) : this.repo;
  }

  async create(
    data: Partial<AcademicSessionEntity>,
    manager?: EntityManager,
  ): Promise<AcademicSessionEntity> {
    const repository = this.repoFor(manager);
    const session = repository.create(data);
    return repository.save(session);
  }

  async findById(id: string): Promise<AcademicSessionEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByAcademicYear(academicYear: string): Promise<AcademicSessionEntity | null> {
    return this.repo.findOne({ where: { academicYear } });
  }

  private buildQuery(status?: string, q?: string) {
    const qb = this.repo.createQueryBuilder('s');
    if (status) {
      qb.andWhere('s.status = :status', { status });
    }
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      qb.andWhere('(s.academic_year ILIKE :term OR s.year_short ILIKE :term)', { term });
    }
    return qb;
  }

  async findAll(filter: FindSessionsFilter): Promise<AcademicSessionEntity[]> {
    const qb = this.buildQuery(filter.status, filter.q);
    qb.orderBy('s.academic_year', 'DESC')
      .limit(filter.limit)
      .offset(filter.offset);
    return qb.getMany();
  }

  async count(filter: { status?: string; q?: string }): Promise<number> {
    const qb = this.buildQuery(filter.status, filter.q);
    return qb.getCount();
  }

  async countOtherOpenSessions(excludeId: string): Promise<number> {
    return this.repo
      .createQueryBuilder('s')
      .where('s.status = :status AND s.id <> :excludeId', {
        status: SessionStatus.OPEN,
        excludeId,
      })
      .getCount();
  }

  async closeOpenSessions(updatedBy?: string | null, manager?: EntityManager): Promise<void> {
    await this.repoFor(manager)
      .createQueryBuilder()
      .update(AcademicSessionEntity)
      .set({
        status: SessionStatus.CLOSED,
        updatedBy: updatedBy || null,
        updatedAt: new Date(),
      })
      .where('status = :status', { status: SessionStatus.OPEN })
      .execute();
  }

  async updateById(
    id: string,
    fields: Partial<AcademicSessionEntity>,
  ): Promise<AcademicSessionEntity | null> {
    await this.repo.update(id, {
      ...fields,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async setStatus(
    id: string,
    status: SessionStatus,
    updatedBy?: string | null,
  ): Promise<AcademicSessionEntity | null> {
    await this.repo.update(id, {
      status,
      updatedBy: updatedBy || null,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async setRegistrationLocked(
    id: string,
    locked: boolean,
    updatedBy?: string | null,
  ): Promise<AcademicSessionEntity | null> {
    await this.repo.update(id, {
      registrationLocked: locked,
      updatedBy: updatedBy || null,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async setFinalNumbersGeneratedAt(
    id: string,
    updatedBy?: string | null,
  ): Promise<AcademicSessionEntity | null> {
    await this.repo.update(id, {
      finalNumbersGeneratedAt: new Date(),
      updatedBy: updatedBy || null,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async findActiveOrLatest(): Promise<AcademicSessionEntity | null> {
    const open = await this.repo.findOne({
      where: { status: SessionStatus.OPEN },
      order: { opensAt: 'DESC' },
    });
    if (open) return open;
    return this.repo.findOne({
      order: { opensAt: 'DESC' },
    });
  }

  async findActive(): Promise<AcademicSessionEntity | null> {
    return this.findActiveOrLatest();
  }

  async update(
    id: string,
    fields: Partial<AcademicSessionEntity>,
  ): Promise<AcademicSessionEntity | null> {
    return this.updateById(id, fields);
  }

  async findPreviousSession(opensAt: Date): Promise<AcademicSessionEntity | null> {
    return this.repo
      .createQueryBuilder('s')
      .where('s.opens_at < :opensAt', { opensAt })
      .orderBy('s.opens_at', 'DESC')
      .getOne();
  }
}
