import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileEntity } from '../entities/file.entity';
import { ListUserFilesQueryDto } from '../dto/file.dto';

@Injectable()
export class FileRepository {
  constructor(
    @InjectRepository(FileEntity)
    private readonly repo: Repository<FileEntity>,
  ) {}

  async create(data: Partial<FileEntity>): Promise<FileEntity> {
    const file = this.repo.create({
      ...data,
      metadata: data.metadata || {},
    });
    return this.repo.save(file);
  }

  async findById(id: string): Promise<FileEntity | null> {
    return this.repo.findOne({
      where: { id },
    });
  }

  async findByContextAndUser(context: string, uploadedBy: string): Promise<FileEntity[]> {
    return this.repo.find({
      where: { context, uploadedBy },
      order: { createdAt: 'DESC' },
    });
  }

  async findUserFiles(userId: string, query: ListUserFilesQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.uploaded_by = :userId', { userId });

    if (query.context) {
      qb.andWhere('f.context = :context', { context: query.context });
    }

    if (query.file_type) {
      qb.andWhere('f.file_type LIKE :fileType', { fileType: `%${query.file_type}%` });
    }

    if (query.q) {
      qb.andWhere("(f.metadata->>'original_name' ILIKE :q OR f.provider_path ILIKE :q)", {
        q: `%${query.q}%`,
      });
    }

    qb.orderBy('f.created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const [files, total] = await qb.getManyAndCount();
    return { files, total, page, limit };
  }

  async softDelete(id: string, userId?: string): Promise<boolean> {
    const where: any = { id };
    if (userId) where.uploadedBy = userId;
    const result = await this.repo.softDelete(where);
    return (result.affected || 0) > 0;
  }
}
