import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ResultEntryEntity } from '../entities/result-entry.entity';

@Injectable()
export class ResultEntryRepository {
  constructor(
    @InjectRepository(ResultEntryEntity)
    private readonly repo: Repository<ResultEntryEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findById(id: string): Promise<ResultEntryEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRegistration(registrationId: string): Promise<ResultEntryEntity[]> {
    return this.repo.find({
      where: { registrationId },
      order: { source: 'ASC', sitting: 'ASC', serial: 'ASC' },
    });
  }

  async updateById(
    id: string,
    fields: Partial<ResultEntryEntity>,
  ): Promise<ResultEntryEntity | null> {
    await this.repo.update(id, fields);
    return this.findById(id);
  }

  async deleteByRegistrationSourceSitting(
    registrationId: string,
    source: string,
    sitting: number,
    onlyOrigin?: string,
  ): Promise<number> {
    const qb = this.repo
      .createQueryBuilder()
      .delete()
      .from(ResultEntryEntity)
      .where('registration_id = :registrationId', { registrationId })
      .andWhere('source = :source', { source })
      .andWhere('sitting = :sitting', { sitting });

    if (onlyOrigin) {
      qb.andWhere('origin = :onlyOrigin', { onlyOrigin });
    }

    const res = await qb.execute();
    return res.affected || 0;
  }

  async bulkUpsert(rows: Array<Partial<ResultEntryEntity>>): Promise<ResultEntryEntity[]> {
    if (!rows || rows.length === 0) return [];

    const results: ResultEntryEntity[] = [];

    for (const r of rows) {
      const existing = await this.repo.findOne({
        where: {
          registrationId: r.registrationId,
          source: r.source,
          sitting: r.sitting,
          serial: r.serial,
        },
      });

      if (existing && existing.origin === 'manual' && r.origin === 'ocr') {
        // Don't overwrite manual correction with OCR
        results.push(existing);
        continue;
      }

      if (existing) {
        existing.subject = r.subject!;
        existing.grade = r.grade!;
        existing.gradeNormalized = r.gradeNormalized !== undefined ? r.gradeNormalized : existing.gradeNormalized;
        existing.score = r.score !== undefined ? r.score : existing.score;
        existing.origin = r.origin || existing.origin;
        if (r.ocrJobId) existing.ocrJobId = r.ocrJobId;
        existing.updatedAt = new Date();
        const saved = await this.repo.save(existing);
        results.push(saved);
      } else {
        const created = this.repo.create({
          registrationId: r.registrationId,
          source: r.source,
          sitting: r.sitting,
          serial: r.serial,
          subject: r.subject,
          grade: r.grade,
          gradeNormalized: r.gradeNormalized,
          score: r.score,
          origin: r.origin || 'manual',
          ocrJobId: r.ocrJobId,
          createdBy: r.createdBy,
        });
        const saved = await this.repo.save(created);
        results.push(saved);
      }
    }

    return results;
  }

  async listForInstitutionWithOcr(registrationId: string) {
    const query = `
      SELECT e.*,
             ores.confidence AS ocr_confidence,
             ores.exam_type_detected AS ocr_exam_type
        FROM jupeb_result_entries e
        LEFT JOIN ocr_results ores ON ores.job_id = e.ocr_job_id
       WHERE e.registration_id = $1
       ORDER BY e.source ASC, e.sitting ASC, e.serial ASC
    `;
    return this.dataSource.query(query, [registrationId]);
  }
}
