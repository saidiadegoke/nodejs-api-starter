import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import {
  DocumentRequirementEntity,
  DocumentRequirementStatus,
} from '../entities/document-requirement.entity';

@Injectable()
export class DocumentRequirementRepository {
  constructor(
    @InjectRepository(DocumentRequirementEntity)
    private readonly repo: Repository<DocumentRequirementEntity>,
  ) {}

  async create(data: Partial<DocumentRequirementEntity>): Promise<DocumentRequirementEntity> {
    const docReq = this.repo.create({
      ...data,
      key: String(data.key).trim().toLowerCase(),
      title: String(data.title).trim(),
      status: data.status || 'active',
      isMandatory: data.isMandatory !== false,
      allowedMimeTypes: data.allowedMimeTypes || [],
      maxFileSizeMb: data.maxFileSizeMb != null ? Number(data.maxFileSizeMb) : 10,
    });
    return this.repo.save(docReq);
  }

  async findById(id: string): Promise<DocumentRequirementEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByKey(key: string): Promise<DocumentRequirementEntity | null> {
    return this.repo.findOne({ where: { key: ILike(String(key).trim()) } });
  }

  async findAll(options: {
    limit: number;
    offset: number;
    status?: string;
  }): Promise<[DocumentRequirementEntity[], number]> {
    const qb = this.repo.createQueryBuilder('dr');

    if (options.status) {
      qb.andWhere('dr.status = :status', { status: options.status });
    }

    return qb
      .orderBy('dr.key', 'ASC')
      .skip(options.offset)
      .take(options.limit)
      .getManyAndCount();
  }

  async findActiveForCompleteness(): Promise<DocumentRequirementEntity[]> {
    return this.repo.find({
      where: { status: 'active' },
      order: { isMandatory: 'DESC', key: 'ASC' },
    });
  }

  async updateById(
    id: string,
    fields: Partial<DocumentRequirementEntity>,
  ): Promise<DocumentRequirementEntity | null> {
    await this.repo.update({ id }, fields);
    return this.findById(id);
  }

  async setStatus(
    id: string,
    status: DocumentRequirementStatus,
  ): Promise<DocumentRequirementEntity | null> {
    await this.repo.update({ id }, { status });
    return this.findById(id);
  }
}
