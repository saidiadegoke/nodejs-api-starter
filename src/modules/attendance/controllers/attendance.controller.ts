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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AttendanceService } from '../services/attendance.service';
import { JwtAuthGuard } from '../../../utils';

@ApiTags('Attendance')
@Controller('attendance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get('home')
  @ApiOperation({ summary: 'Attendance home summary' })
  @ApiQuery({ name: 'candidate_code', required: false, description: 'Candidate code or number' })
  @ApiQuery({ name: 'candidate_number', required: false, description: 'Candidate code or number alias' })
  async getHome(@Query() query: any, @Req() req: any) {
    return this.attendanceService.getHome(req.user || req.user?.user_id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Attendance breakdown summary' })
  @ApiQuery({ name: 'candidate_code', required: false, description: 'Candidate code or number' })
  @ApiQuery({ name: 'candidate_number', required: false, description: 'Candidate code or number alias' })
  async getSummary(@Query() query: any, @Req() req: any) {
    return this.attendanceService.getSummary(req.user || req.user?.user_id, query);
  }

  @Get('classes')
  @ApiOperation({ summary: 'Attendance classes' })
  @ApiQuery({ name: 'candidate_code', required: false, description: 'Candidate code or number' })
  @ApiQuery({ name: 'candidate_number', required: false, description: 'Candidate code or number alias' })
  async getClasses(@Query() query: any, @Req() req: any) {
    return this.attendanceService.getClasses(req.user || req.user?.user_id, query);
  }

  @Get('history')
  @ApiOperation({ summary: 'Attendance history' })
  @ApiQuery({ name: 'candidate_code', required: false, description: 'Candidate code or number' })
  @ApiQuery({ name: 'candidate_number', required: false, description: 'Candidate code or number alias' })
  async getHistory(@Query() query: any, @Req() req: any) {
    return this.attendanceService.getHistory(req.user || req.user?.user_id, query);
  }

  @Get('courses/:courseCode/sessions')
  @ApiOperation({ summary: 'Course attendance sessions' })
  @ApiQuery({ name: 'candidate_code', required: false, description: 'Candidate code or number' })
  @ApiQuery({ name: 'candidate_number', required: false, description: 'Candidate code or number alias' })
  async getCourseSessions(
    @Param('courseCode') courseCode: string,
    @Query() query: any,
    @Req() req: any,
  ) {
    return this.attendanceService.getCourseSessions(req.user || req.user?.user_id, courseCode, query);
  }

  @Get('timetable')
  @ApiOperation({ summary: 'Student class timetable' })
  @ApiQuery({ name: 'candidate_code', required: false, description: 'Candidate code or number' })
  @ApiQuery({ name: 'candidate_number', required: false, description: 'Candidate code or number alias' })
  async getTimetable(@Query() query: any, @Req() req: any) {
    return this.attendanceService.getTimetable(req.user || req.user?.user_id, query);
  }

  @Post(['check-in', 'check-in/:classId'])
  @ApiOperation({ summary: 'Check in for class session' })
  async checkIn(
    @Param('classId') classId: string,
    @Query() query: any,
    @Body() body: any,
    @Req() req: any,
  ) {
    const payload = { ...query, ...body };
    const effectiveClassId = classId || payload.lecture_id;
    return this.attendanceService.checkIn(req.user || req.user?.user_id, effectiveClassId, payload);
  }

  @Post(['check-out', 'check-out/:classId'])
  @ApiOperation({ summary: 'Check out of class session' })
  async checkOut(
    @Param('classId') classId: string,
    @Query() query: any,
    @Body() body: any,
    @Req() req: any,
  ) {
    const payload = { ...query, ...body };
    const effectiveClassId = classId || payload.lecture_id;
    return this.attendanceService.checkOut(req.user || req.user?.user_id, effectiveClassId, payload);
  }
}
