import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, ILike } from 'typeorm';
import { SubjectEntity, SubjectStatus } from '../entities/subject.entity';

@Injectable()
export class SubjectRepository {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly repo: Repository<SubjectEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(data: Partial<SubjectEntity>): Promise<SubjectEntity> {
    const subject = this.repo.create(data);
    return this.repo.save(subject);
  }

  async findById(id: string): Promise<SubjectEntity | null> {
    return this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async findByCode(code: string): Promise<SubjectEntity | null> {
    if (!code) return null;
    return this.repo.findOne({
      where: { code: ILike(code.trim()), deletedAt: IsNull() },
    });
  }

  async findByName(name: string): Promise<SubjectEntity | null> {
    if (!name) return null;
    return this.repo.findOne({
      where: { name: ILike(name.trim()), deletedAt: IsNull() },
    });
  }

  async findPublicActive(): Promise<SubjectEntity[]> {
    return this.repo.find({
      where: { status: 'active', deletedAt: IsNull() },
      order: { name: 'ASC' },
    });
  }

  async findAllAdmin(options: {
    limit: number;
    offset: number;
    status?: string;
    q?: string;
  }): Promise<[SubjectEntity[], number]> {
    const qb = this.repo
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL');

    if (options.status) {
      qb.andWhere('s.status = :status', { status: options.status });
    }

    if (options.q && options.q.trim()) {
      const term = `%${options.q.trim()}%`;
      qb.andWhere(
        '(s.code ILIKE :term OR s.name ILIKE :term OR COALESCE(s.description, \'\') ILIKE :term)',
        { term },
      );
    }

    return qb
      .orderBy('s.name', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  async enrolledCountsForSubjects(
    subjectIds: string[],
    sessionId?: string | null,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!subjectIds || !subjectIds.length || !sessionId) return map;

    const result = await this.dataSource.query(
      `SELECT i.subject_id, COUNT(DISTINCT r.id)::int AS c
       FROM jupeb_subject_combination_items i
       JOIN jupeb_registrations r ON r.subject_combination_id = i.combination_id
       WHERE i.subject_id = ANY($1::uuid[])
         AND r.status <> 'withdrawn'
         AND r.session_id = $2
       GROUP BY i.subject_id`,
      [subjectIds, sessionId],
    );

    for (const row of result) {
      map.set(row.subject_id, row.c);
    }
    return map;
  }

  async updateById(id: string, fields: Partial<SubjectEntity>): Promise<SubjectEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, fields);
    return this.findById(id);
  }

  async setStatus(id: string, status: SubjectStatus): Promise<SubjectEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, { status });
    return this.findById(id);
  }

  async softDelete(id: string): Promise<SubjectEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.repo.softDelete(id);
    return existing;
  }
}
