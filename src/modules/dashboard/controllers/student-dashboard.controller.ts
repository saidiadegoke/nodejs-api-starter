import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StudentDashboardService } from '../services/student-dashboard.service';
import { StudentDashboardQueryDto, StudentHomeResponseDto } from '../dto';
import { JwtAuthGuard } from '../../../utils';

@ApiTags('Student Mobile Dashboard')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class StudentDashboardController {
  constructor(private readonly studentDashboardService: StudentDashboardService) {}

  @Get(['dashboard/student/home', 'dashboard/home', 'jupeb/dashboard/home'])
  @ApiOperation({
    summary: 'Student mobile dashboard home screen',
    description: 'Returns attendance summary, average score, todays schedule, and unread notifications count.',
  })
  @ApiOkResponse({ type: StudentHomeResponseDto })
  async getHome(@Query() query: StudentDashboardQueryDto, @Req() req: any) {
    return this.studentDashboardService.getHome(req.user?.user_id, query);
  }

  @Get(['dashboard/student/courses', 'dashboard/courses', 'jupeb/dashboard/courses'])
  @ApiOperation({
    summary: 'Student enrolled courses list',
    description: 'Returns all enrolled courses and attendance statistics per course.',
  })
  async getCourses(@Req() req: any) {
    return this.studentDashboardService.getCourses(req.user?.user_id);
  }

  @Get([
    'dashboard/student/results',
    'dashboard/results',
    'jupeb/dashboard/results',
    'students/me/results',
    'jupeb/students/me/results',
  ])
  @ApiOperation({
    summary: 'Student released exam results',
    description: 'Returns official exam grades and scores once released by the candidate institution.',
  })
  async getResults(@Req() req: any) {
    return this.studentDashboardService.getResults(req.user?.user_id);
  }

  @Post([
    'dashboard/student/check-in/:classId',
    'dashboard/attendance/classes/:classId/check-in',
    'jupeb/dashboard/attendance/classes/:classId/check-in',
  ])
  @ApiOperation({
    summary: 'Student class attendance check-in',
    description: 'Marks attendance check-in timestamp and geolocation for a class session.',
  })
  async checkIn(@Param('classId') classId: string, @Body() body: any, @Req() req: any) {
    return this.studentDashboardService.checkIn(req.user?.user_id, classId, body);
  }

  @Post([
    'dashboard/student/check-out/:classId',
    'dashboard/attendance/classes/:classId/check-out',
    'jupeb/dashboard/attendance/classes/:classId/check-out',
  ])
  @ApiOperation({
    summary: 'Student class attendance check-out',
    description: 'Marks attendance check-out timestamp for a class session.',
  })
  async checkOut(@Param('classId') classId: string, @Body() body: any, @Req() req: any) {
    return this.studentDashboardService.checkOut(req.user?.user_id, classId, body);
  }
}
