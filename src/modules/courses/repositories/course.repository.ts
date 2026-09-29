import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CourseEntity, CourseStatus } from '../entities/course.entity';

@Injectable()
export class CourseRepository {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly repo: Repository<CourseEntity>,
  ) {}

  async create(data: { code: string; title: string; status?: CourseStatus }): Promise<CourseEntity> {
    const course = this.repo.create({
      code: String(data.code).trim(),
      title: String(data.title).trim(),
      status: data.status || 'active',
    });
    return this.repo.save(course);
  }

  async findById(id: string): Promise<CourseEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<CourseEntity | null> {
    return this.repo.findOne({ where: { code: String(code).trim() } });
  }

  async listActive(): Promise<CourseEntity[]> {
    return this.repo.find({
      where: { status: 'active' },
      order: { code: 'ASC' },
    });
  }
}
