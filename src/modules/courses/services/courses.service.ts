import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CourseRepository } from '../repositories/course.repository';
import { CourseEntity } from '../entities/course.entity';
import { CreateCourseDto } from '../dtos/course.dto';
import { CommodLogger, LoggerFactory } from '../../../logger';

@Injectable()
export class CoursesService {
  private readonly logger: CommodLogger;

  constructor(
    private readonly courseRepo: CourseRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(CoursesService.name);
  }

  async listCourses(): Promise<CourseEntity[]> {
    return this.courseRepo.listActive();
  }

  async createCourse(dto: CreateCourseDto): Promise<CourseEntity> {
    if (!dto.code || !dto.title) {
      throw new UnprocessableEntityException('code and title are required');
    }

    const existing = await this.courseRepo.findByCode(dto.code);
    if (existing) {
      throw new ConflictException({
        message: 'Course with this code already exists',
        details: { field: 'code', value: dto.code },
      });
    }

    return this.courseRepo.create({
      code: dto.code,
      title: dto.title,
      status: (dto.status as any) || 'active',
    });
  }

  async getById(id: string): Promise<CourseEntity> {
    if (!id) throw new UnprocessableEntityException('Invalid course id');
    const course = await this.courseRepo.findById(id);
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }
}
