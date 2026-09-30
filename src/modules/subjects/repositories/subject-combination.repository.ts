import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, ILike } from 'typeorm';
import {
  SubjectCombinationEntity,
  SubjectCombinationStatus,
} from '../entities/subject-combination.entity';
import { SubjectCombinationItemEntity } from '../entities/subject-combination-item.entity';

@Injectable()
export class SubjectCombinationRepository {
  constructor(
    @InjectRepository(SubjectCombinationEntity)
    private readonly repo: Repository<SubjectCombinationEntity>,
    @InjectRepository(SubjectCombinationItemEntity)
    private readonly itemRepo: Repository<SubjectCombinationItemEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(data: Partial<SubjectCombinationEntity>): Promise<SubjectCombinationEntity> {
    const combo = this.repo.create(data);
    return this.repo.save(combo);
  }

  async findById(id: string): Promise<SubjectCombinationEntity | null> {
    return this.repo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['items', 'items.subject'],
    });
  }

  async findByCode(code: string): Promise<SubjectCombinationEntity | null> {
    if (!code) return null;
    return this.repo.findOne({
      where: { code: ILike(code.trim()), deletedAt: IsNull() },
    });
  }

  async findPublicActive(options?: { universityId?: string | null }): Promise<SubjectCombinationEntity[]> {
    const qb = this.repo
      .createQueryBuilder('sc')
      .where('sc.deleted_at IS NULL')
      .andWhere('sc.status = :status', { status: 'active' });

    if (options?.universityId) {
      qb.andWhere('(sc.is_global = true OR sc.university_id = :uniId)', {
        uniId: options.universityId,
      });
    } else {
      qb.andWhere('sc.is_global = true');
    }

    return qb.orderBy('sc.code', 'ASC').addOrderBy('sc.title', 'ASC').getMany();
  }

  async findAllAdmin(options: {
    limit: number;
    offset: number;
    status?: string;
    universityId?: string | null;
    q?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<[SubjectCombinationEntity[], number]> {
    const qb = this.repo
      .createQueryBuilder('sc')
      .where('sc.deleted_at IS NULL');

    if (options.status) {
      qb.andWhere('sc.status = :status', { status: options.status });
    }

    if (options.universityId) {
      qb.andWhere('(sc.is_global = true OR sc.university_id = :uniId)', {
        uniId: options.universityId,
      });
    }

    if (options.q && options.q.trim()) {
      const term = `%${options.q.trim()}%`;
      qb.andWhere('(sc.code ILIKE :term OR sc.title ILIKE :term)', { term });
    }

    const orderDir = String(options.sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    if (options.sortBy === 'title') {
      qb.orderBy('sc.title', orderDir).addOrderBy('sc.code', 'ASC');
    } else if (options.sortBy === 'created_at') {
      qb.orderBy('sc.createdAt', orderDir);
    } else {
      qb.orderBy('sc.code', orderDir).addOrderBy('sc.title', 'ASC');
    }

    return qb
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  async listItemsForCombinations(
    combinationIds: string[],
  ): Promise<Map<string, any[]>> {
    const map = new Map<string, any[]>();
    if (!combinationIds || !combinationIds.length) return map;

    const rows = await this.dataSource.query(
      `SELECT i.combination_id, i.id, i.position, i.subject_id, s.code, s.name
       FROM jupeb_subject_combination_items i
       JOIN jupeb_subjects s ON s.id = i.subject_id
       WHERE i.combination_id = ANY($1::uuid[])
       ORDER BY i.combination_id, i.position ASC`,
      [combinationIds],
    );

    for (const row of rows) {
      if (!map.has(row.combination_id)) map.set(row.combination_id, []);
      map.get(row.combination_id)!.push({
        id: row.id,
        position: row.position,
        subject_id: row.subject_id,
        code: row.code,
        name: row.name,
      });
    }
    return map;
  }

  async enrolledCountsForCombinations(
    combinationIds: string[],
    options?: { sessionId?: string | null; universityId?: string | null },
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!combinationIds || !combinationIds.length) return map;

    const uniqueIds = Array.from(new Set(combinationIds));
    for (const id of uniqueIds) map.set(id, 0);

    const conditions = ["r.status <> 'withdrawn'"];
    const params: any[] = [uniqueIds];
    let pIdx = 2;
    if (options?.sessionId) {
      conditions.push(`r.session_id = $${pIdx++}`);
      params.push(options.sessionId);
    }
    if (options?.universityId) {
      conditions.push(`r.university_id = $${pIdx++}`);
      params.push(options.universityId);
    }

    const query = `
      WITH combo_subjects AS (
        SELECT
          combination_id,
          ARRAY_AGG(subject_id ORDER BY subject_id) AS subject_ids,
          COUNT(subject_id)::int AS subject_count
        FROM jupeb_subject_combination_items
        GROUP BY combination_id
      ),
      reg_combo_counts AS (
        SELECT
          cs.subject_ids,
          COUNT(DISTINCT r.id)::int AS candidate_count
        FROM jupeb_registrations r
        JOIN combo_subjects cs ON cs.combination_id = r.subject_combination_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY cs.subject_ids
      )
      SELECT
        target_ids.id AS combination_id,
        COALESCE(rcc.candidate_count, 0)::int AS enrolled_count
      FROM UNNEST($1::uuid[]) AS target_ids(id)
      LEFT JOIN combo_subjects cs ON cs.combination_id = target_ids.id
      LEFT JOIN reg_combo_counts rcc
        ON cs.subject_ids = rcc.subject_ids AND cs.subject_ids IS NOT NULL
    `;

    const rows = await this.dataSource.query(query, params);
    for (const row of rows) {
      map.set(row.combination_id, row.enrolled_count);
    }
    return map;
  }

  async replaceItems(combinationId: string, subjectIdsInOrder: string[]): Promise<void> {
    await this.itemRepo.delete({ combinationId });
    for (let i = 0; i < subjectIdsInOrder.length; i += 1) {
      if (!subjectIdsInOrder[i]) continue;
      await this.itemRepo.save({
        combinationId,
        subjectId: subjectIdsInOrder[i],
        position: i,
      });
    }
  }

  async updateById(
    id: string,
    fields: Partial<SubjectCombinationEntity>,
  ): Promise<SubjectCombinationEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, fields);
    return this.findById(id);
  }

  async setStatus(
    id: string,
    status: SubjectCombinationStatus,
  ): Promise<SubjectCombinationEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, { status });
    return this.findById(id);
  }

  async softDelete(id: string): Promise<SubjectCombinationEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.repo.softDelete(id);
    return existing;
  }
}
