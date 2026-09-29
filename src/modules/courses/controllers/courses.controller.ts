import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CoursesService } from '../services/courses.service';
import { CreateCourseDto, CourseResponseDto } from '../dtos/course.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../shared';

@ApiTags('Courses')
@Controller()
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get(['academic/courses', 'courses'])
  @ApiOperation({
    summary: 'List active JUPEB courses',
    description: 'Returns available active courses for academic results and examinations.',
  })
  @ApiOkResponse({ type: [CourseResponseDto] })
  async listCourses() {
    return this.coursesService.listCourses();
  }

  @Post(['academic/courses', 'courses'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.academic.manage')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new JUPEB course',
    description: 'Registers a new course for candidate scoring and result processing.',
  })
  @ApiCreatedResponse({ type: CourseResponseDto })
  async createCourse(@Body() dto: CreateCourseDto) {
    return this.coursesService.createCourse(dto);
  }
}
