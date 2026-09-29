import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from './entities/course.entity';
import { CourseRepository } from './repositories/course.repository';
import { CoursesService } from './services/courses.service';
import { CoursesController } from './controllers/courses.controller';
import { SharedModule } from '../../shared';

@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity]), SharedModule],
  controllers: [CoursesController],
  providers: [CourseRepository, CoursesService],
  exports: [CourseRepository, CoursesService, TypeOrmModule],
})
export class CoursesModule {}
