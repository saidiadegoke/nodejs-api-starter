import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RegistrationEntity, RegistrationStatus } from '../entities/registration.entity';

export interface RegistrationListFilter {
  sessionId?: string;
  universityId?: string;
  status?: string;
  bucket?: string;
  biometrics?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class RegistrationRepository {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly repo: Repository<RegistrationEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<RegistrationEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByUserId(userId: string): Promise<RegistrationEntity | null> {
    return this.repo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findLatestForUser(userId: string): Promise<RegistrationEntity | null> {
    return this.findByUserId(userId);
  }

  async findActiveByUserId(userId: string, sessionId?: string): Promise<RegistrationEntity | null> {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.user_id = :userId', { userId });

    if (sessionId) {
      qb.andWhere('r.session_id = :sessionId', { sessionId });
    }
    qb.orderBy('r.created_at', 'DESC');
    return qb.getOne();
  }

  async findByCandidateCode(candidateCode: string): Promise<RegistrationEntity | null> {
    const code = String(candidateCode || '').trim();
    if (!code) return null;

    return this.repo
      .createQueryBuilder('r')
      .where('r.provisional_candidate_code = :code OR r.institution_issued_code = :code OR r.jupeb_candidate_number = :code', { code })
      .orderBy('r.created_at', 'DESC')
      .getOne();
  }

  async findByCandidateNumber(candidateNumber: string): Promise<RegistrationEntity | null> {
    return this.repo.findOne({
      where: { jupebCandidateNumber: candidateNumber },
    });
  }

  async findByInstitutionCode(code: string): Promise<RegistrationEntity | null> {
    return this.repo.findOne({
      where: { institutionIssuedCode: code.trim() },
    });
  }

  async findByNinVerificationId(ninVerificationId: string): Promise<RegistrationEntity[]> {
    return this.repo.find({
      where: { ninVerificationId },
      order: { createdAt: 'DESC' },
    });
  }

  async hasBlockingRegistrationForNinHash(ninHash: string, sessionId?: string): Promise<boolean> {
    if (!ninHash) return false;
    const qb = this.repo
      .createQueryBuilder('r')
      .innerJoin('jupeb_nin_verifications', 'nv', 'nv.id = r.nin_verification_id')
      .where('nv.nin_hash = :ninHash', { ninHash })
      .andWhere('r.status NOT IN (:...nonBlocking)', {
        nonBlocking: [RegistrationStatus.REJECTED, RegistrationStatus.WITHDRAWN],
      });

    if (sessionId) {
      qb.andWhere('r.session_id = :sessionId', { sessionId });
    }
    const count = await qb.getCount();
    return count > 0;
  }

  async findBlockingRegistrationsByNinHashes(
    hashes: string[],
    sessionId?: string,
  ): Promise<Set<string>> {
    if (!Array.isArray(hashes) || !hashes.length) return new Set();

    const qb = this.repo
      .createQueryBuilder('r')
      .innerJoin('jupeb_nin_verifications', 'nv', 'nv.id = r.nin_verification_id')
      .select('DISTINCT nv.nin_hash', 'nin_hash')
      .where('nv.nin_hash IN (:...hashes)', { hashes })
      .andWhere('r.status NOT IN (:...nonBlocking)', {
        nonBlocking: [RegistrationStatus.REJECTED, RegistrationStatus.WITHDRAWN],
      });

    if (sessionId) {
      qb.andWhere('r.session_id = :sessionId', { sessionId });
    }

    const raw = await qb.getRawMany();
    return new Set(raw.map((r) => r.nin_hash));
  }

  async create(data: Partial<RegistrationEntity>): Promise<RegistrationEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async updateById(
    id: string,
    fields: Partial<RegistrationEntity>,
  ): Promise<RegistrationEntity | null> {
    await this.repo.update(id, {
      ...fields,
      updatedAt: new Date(),
    });
    return this.findById(id);
  }

  async setStatus(
    id: string,
    status: RegistrationStatus | string,
    reason?: string | null,
    approvedBy?: string | null,
  ): Promise<RegistrationEntity | null> {
    const isApproved = status === RegistrationStatus.APPROVED || status === 'approved';
    if (isApproved) {
      await this.dataSource.query(
        `UPDATE jupeb_registrations
         SET status = $1,
             status_reason = $2,
             approved_at = NOW(),
             approved_by = $3,
             dashboard_unlocked_at = NOW(),
             updated_at = NOW()
         WHERE id = $4`,
        [String(status), reason || null, approvedBy || null, id],
      );
    } else {
      await this.dataSource.query(
        `UPDATE jupeb_registrations
         SET status = $1,
             status_reason = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [String(status), reason || null, id],
      );
    }
    return this.findById(id);
  }

  async findAllPaginated(filter: RegistrationListFilter) {
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const offset = Math.max(0, filter.offset || 0);

    const qb = this.repo
      .createQueryBuilder('r')
      .leftJoin('jupeb_universities', 'u', 'u.id = r.university_id')
      .leftJoin('users', 'usr', 'usr.id = r.user_id')
      .leftJoin('profiles', 'p', 'p.user_id = r.user_id')
      .leftJoin('jupeb_subject_combinations', 'sc', 'sc.id = r.subject_combination_id')
      .leftJoin('jupeb_nin_verifications', 'nv', 'nv.id = r.nin_verification_id')
      .select([
        'r.id AS id',
        'r.session_id AS session_id',
        'r.university_id AS university_id',
        'r.user_id AS user_id',
        'r.status AS status',
        'r.provisional_candidate_code AS provisional_candidate_code',
        'r.jupeb_candidate_number AS jupeb_candidate_number',
        'r.institution_issued_code AS institution_issued_code',
        'r.created_at AS created_at',
        'r.updated_at AS updated_at',
        'r.submitted_at AS submitted_at',
        'r.approved_at AS approved_at',
        'u.id AS uni_id',
        'u.name AS university_name',
        'u.short_name AS university_short_name',
        'u.code AS university_code',
        'p.first_name AS first_name',
        'p.last_name AS last_name',
        'p.display_name AS display_name',
        'p.profile_photo_url AS profile_photo_url',
        'usr.email AS email',
        'usr.phone AS phone',
        'nv.nin_last4 AS nin_last4',
        'sc.id AS subject_combination_id',
        'sc.code AS subject_combination_code',
        'sc.title AS subject_combination_title',
      ])
      .addSelect(
        `EXISTS (
          SELECT 1 FROM jupeb_biometric_captures bc
          WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL
        )`,
        'has_biometrics',
      );

    if (filter.sessionId) {
      qb.andWhere('r.session_id = :sessionId', { sessionId: filter.sessionId });
    }
    if (filter.universityId) {
      qb.andWhere('r.university_id = :universityId', { universityId: filter.universityId });
    }
    if (filter.status) {
      qb.andWhere('r.status = :status', { status: filter.status });
    } else if (filter.bucket) {
      const b = filter.bucket.toLowerCase();
      if (b === 'approved') {
        qb.andWhere('r.status = :status', { status: RegistrationStatus.APPROVED });
      } else if (b === 'rejected') {
        qb.andWhere('r.status = :status', { status: RegistrationStatus.REJECTED });
      } else if (b === 'withdrawn') {
        qb.andWhere('r.status = :status', { status: RegistrationStatus.WITHDRAWN });
      } else if (
        b === 'awaiting_action' ||
        b === 'pending_institution_review' ||
        b === 'awaiting_review' ||
        b === 'awaiting_approval'
      ) {
        qb.andWhere('r.status IN (:...actionStatuses)', {
          actionStatuses: [
            RegistrationStatus.PENDING_INSTITUTION_REVIEW,
            'pending_institution_review',
          ],
        });
      } else if (b === 'pending') {
        qb.andWhere('r.status NOT IN (:...doneStatuses)', {
          doneStatuses: [
            RegistrationStatus.APPROVED,
            RegistrationStatus.REJECTED,
            RegistrationStatus.WITHDRAWN,
          ],
        });
      } else {
        qb.andWhere('r.status = :bucket', { bucket: filter.bucket });
      }
    }
    if (filter.biometrics === 'with_biometrics') {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM jupeb_biometric_captures bc WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL)`,
      );
    } else if (filter.biometrics === 'without_biometrics') {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM jupeb_biometric_captures bc WHERE bc.registration_id = r.id AND bc.replaced_at IS NULL)`,
      );
    }
    if (filter.q && filter.q.trim()) {
      const term = `%${filter.q.trim()}%`;
      qb.andWhere(
        `(
          p.first_name ILIKE :term OR
          p.last_name ILIKE :term OR
          p.display_name ILIKE :term OR
          CONCAT(COALESCE(p.first_name, ''), ' ', COALESCE(p.last_name, '')) ILIKE :term OR
          CONCAT(COALESCE(p.last_name, ''), ' ', COALESCE(p.first_name, '')) ILIKE :term OR
          usr.email ILIKE :term OR
          usr.phone ILIKE :term OR
          r.provisional_candidate_code ILIKE :term OR
          r.jupeb_candidate_number ILIKE :term OR
          r.institution_issued_code ILIKE :term OR
          nv.nin_last4 ILIKE :term OR
          nv.intake_payload->>'name' ILIKE :term OR
          nv.intake_payload->>'email' ILIKE :term OR
          TRIM(CONCAT(COALESCE(nv.response_payload->>'first_name', ''), ' ', COALESCE(nv.response_payload->>'last_name', ''))) ILIKE :term
        )`,
        { term },
      );
    }

    const total = await qb.getCount();
    const rows = await qb.orderBy('r.created_at', 'DESC').limit(limit).offset(offset).getRawMany();

    return { rows, total };
  }
}
