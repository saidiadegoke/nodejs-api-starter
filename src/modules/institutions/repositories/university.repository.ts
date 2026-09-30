import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, ILike } from 'typeorm';
import { UniversityEntity, UniversityStatus } from '../entities/university.entity';

@Injectable()
export class UniversityRepository {
  constructor(
    @InjectRepository(UniversityEntity)
    private readonly repo: Repository<UniversityEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(data: Partial<UniversityEntity>): Promise<UniversityEntity> {
    const university = this.repo.create(data);
    return this.repo.save(university);
  }

  async findById(id: string): Promise<UniversityEntity | null> {
    return this.repo.findOne({
      where: { id, deletedAt: IsNull() },
    });
  }

  async findByJupebPrefix(prefix: string): Promise<UniversityEntity | null> {
    if (!prefix) return null;
    const clean = String(prefix).trim().replace(/^['’`"]+/, '').trim();
    return this.repo.findOne({
      where: { jupebPrefix: clean, deletedAt: IsNull() },
    });
  }

  async findByCode(code: string): Promise<UniversityEntity | null> {
    if (!code) return null;
    return this.repo.findOne({
      where: { code: ILike(code.trim()), deletedAt: IsNull() },
    });
  }

  async findPublicActive(options?: { universityType?: string | null }): Promise<UniversityEntity[]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.deleted_at IS NULL')
      .andWhere('u.status = :status', { status: 'active' });

    if (options?.universityType) {
      qb.andWhere('u.university_type = :type', { type: options.universityType });
    }

    return qb.orderBy('u.name', 'ASC').getMany();
  }

  async findAllAdmin(options: {
    limit: number;
    offset: number;
    status?: string;
    q?: string;
  }): Promise<[UniversityEntity[], number]> {
    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.deleted_at IS NULL');

    if (options.status) {
      qb.andWhere('u.status = :status', { status: options.status });
    }

    if (options.q && options.q.trim()) {
      const term = `%${options.q.trim()}%`;
      qb.andWhere(
        '(u.code ILIKE :term OR u.name ILIKE :term OR COALESCE(u.short_name, \'\') ILIKE :term)',
        { term },
      );
    }

    return qb
      .orderBy('u.name', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  async resolveForUser(userId: string): Promise<UniversityEntity | null> {
    const raw = await this.dataSource.query(
      `SELECT u.id, u.code, u.name, u.short_name, u.jupeb_prefix, u.status,
              u.expected_candidate_count, u.metadata, u.university_type, u.email, u.address, u.phone, u.description,
              u.created_at, u.updated_at
         FROM jupeb_universities u
        WHERE u.deleted_at IS NULL
          AND u.id = COALESCE(
            (SELECT jupeb_university_id FROM profiles WHERE user_id = $1),
            (SELECT university_id FROM jupeb_registrations
              WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)
          )
        LIMIT 1`,
      [userId],
    );
    if (!raw || !raw[0]) return null;
    return this.repo.create(raw[0] as Partial<UniversityEntity>);
  }

  async updateById(id: string, fields: Partial<UniversityEntity>): Promise<UniversityEntity | null> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const currentRows = await queryRunner.query(
        `SELECT email FROM jupeb_universities WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
      );
      const current = currentRows[0];
      if (!current) {
        await queryRunner.rollbackTransaction();
        return null;
      }

      const sets: string[] = [];
      const values: any[] = [];
      let i = 1;

      const allowedFields: (keyof UniversityEntity)[] = [
        'name',
        'shortName',
        'metadata',
        'jupebPrefix',
        'code',
        'universityType',
        'email',
        'address',
        'phone',
        'expectedCandidateCount',
        'description',
        'status',
      ];

      const columnMap: Record<string, string> = {
        shortName: 'short_name',
        jupebPrefix: 'jupeb_prefix',
        universityType: 'university_type',
        expectedCandidateCount: 'expected_candidate_count',
      };

      for (const key of allowedFields) {
        if (fields[key] !== undefined) {
          const colName = columnMap[key] || key;
          if (key === 'metadata') {
            sets.push(`${colName} = $${i++}::jsonb`);
            values.push(JSON.stringify(fields[key]));
          } else {
            sets.push(`${colName} = $${i++}`);
            values.push(typeof fields[key] === 'string' ? (fields[key] as string).trim() : fields[key]);
          }
        }
      }

      if (sets.length > 0) {
        sets.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);
        await queryRunner.query(
          `UPDATE jupeb_universities SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL`,
          values,
        );
      }

      // Sync user email/phone if changed
      if (fields.email !== undefined || fields.phone !== undefined) {
        const userSets: string[] = [];
        const userValues: any[] = [];
        let userIdx = 1;

        if (fields.email !== undefined) {
          userSets.push(`email = $${userIdx++}`);
          userValues.push(String(fields.email).trim().toLowerCase());
        }
        if (fields.phone !== undefined) {
          userSets.push(`phone = $${userIdx++}`);
          userValues.push(
            typeof fields.phone === 'string' ? fields.phone.trim() || null : fields.phone,
          );
        }
        userSets.push('updated_at = CURRENT_TIMESTAMP');
        const previousEmailIdx = userIdx;
        userValues.push(current.email || null);
        userIdx += 1;
        const universityIdIdx = userIdx;
        userValues.push(id);

        await queryRunner.query(
          `UPDATE users u
              SET ${userSets.join(', ')}
            WHERE u.id = (
              SELECT candidate.id
                FROM (
                  SELECT usr.id,
                         usr.created_at,
                         COALESCE(uu.is_primary, false) AS is_primary,
                         CASE
                           WHEN $${previousEmailIdx}::text IS NOT NULL
                            AND LOWER(usr.email) = LOWER($${previousEmailIdx})
                           THEN 0 ELSE 1
                         END AS email_rank
                    FROM users usr
                    LEFT JOIN user_universities uu
                      ON uu.user_id = usr.id
                     AND uu.university_id = $${universityIdIdx}
                     AND uu.deleted_at IS NULL
                    LEFT JOIN profiles p ON p.user_id = usr.id
                   WHERE usr.deleted_at IS NULL
                     AND (
                       uu.role = 'institution_admin'
                       OR (
                         p.jupeb_university_id = $${universityIdIdx}
                         AND EXISTS (
                           SELECT 1
                             FROM user_roles ur
                             JOIN roles r ON r.id = ur.role_id
                            WHERE ur.user_id = usr.id
                              AND r.name = 'institution_admin'
                              AND r.owner_jupeb_university_id IS NULL
                              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
                         )
                       )
                     )
                 ) candidate
               ORDER BY candidate.email_rank ASC,
                        CASE WHEN candidate.is_primary THEN 0 ELSE 1 END ASC,
                        candidate.created_at ASC
               LIMIT 1
            )`,
          userValues,
        );
      }

      await queryRunner.commitTransaction();
      return this.findById(id);
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async setStatus(id: string, status: UniversityStatus): Promise<UniversityEntity | null> {
    await this.repo.update({ id, deletedAt: IsNull() }, { status });
    return this.findById(id);
  }

  async softDelete(id: string): Promise<UniversityEntity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    await this.repo.softDelete(id);
    return existing;
  }

  async enrolledCountsForUniversities(
    universityIds: string[],
    sessionId?: string | null,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!universityIds || !universityIds.length || !sessionId) return map;

    const result = await this.dataSource.query(
      `SELECT university_id, COUNT(*)::int AS c
       FROM jupeb_registrations
       WHERE university_id = ANY($1::uuid[])
         AND session_id = $2
         AND status <> 'withdrawn'
       GROUP BY university_id`,
      [universityIds, sessionId],
    );

    for (const row of result) {
      map.set(row.university_id, row.c);
    }
    return map;
  }
}
