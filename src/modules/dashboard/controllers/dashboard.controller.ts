import {
  Controller,
  Get,
  Patch,
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
import { DashboardService } from '../services/dashboard.service';
import {
  DashboardQueryDto,
  PatchUserJupebUniversityDto,
  DashboardStatCardsResponseDto,
  DashboardQuickStatsResponseDto,
  DashboardStudentsStatusResponseDto,
  DashboardRegistrationTrendsResponseDto,
  InstitutionDistributionResponseDto,
  InstitutionTrendsResponseDto,
  SubjectCombinationDistributionResponseDto,
  SubjectEnrollmentItemDto,
  SessionTimelineResponseDto,
  RecentRegistrationItemDto,
} from '../dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../shared';

@ApiTags('Program Analytics & Dashboard')
@Controller(['dashboard', 'jupeb/dashboard'])
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('scope')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Get active / effective dashboard scope',
    description: 'Resolves university scope and active session context for the authenticated user.',
  })
  async getScope(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getScope(query, req.user?.user_id);
  }

  @Get('stat-cards')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Executive dashboard KPI summary cards',
    description: 'Returns high-level statistics for universities, registration counts, and biometric compliance with delta % vs previous session.',
  })
  @ApiOkResponse({ type: DashboardStatCardsResponseDto })
  async getStatCards(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getStatCards(query, req.user?.user_id);
  }

  @Get('quick-stats')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Quick stats bar summary',
    description: 'Compact metrics: total students, institution count, and session status.',
  })
  @ApiOkResponse({ type: DashboardQuickStatsResponseDto })
  async getQuickStats(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getQuickStats(query, req.user?.user_id);
  }

  @Get('students-status')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Registration status breakdown',
    description: 'Counts candidates by approved, rejected, and pending status.',
  })
  @ApiOkResponse({ type: DashboardStudentsStatusResponseDto })
  async getStudentsStatus(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getStudentsStatus(query, req.user?.user_id);
  }

  @Get('registration-trends')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Candidate intake and registration monthly trends',
    description: 'Monthly intake trajectory over session months or full calendar year comparison series.',
  })
  @ApiOkResponse({ type: DashboardRegistrationTrendsResponseDto })
  async getRegistrationTrends(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getRegistrationTrends(query, req.user?.user_id);
  }

  @Get('institution-distribution')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Institution breakdown by university type',
    description: 'Donut chart distribution of universities by type (federal, state, private, unspecified).',
  })
  @ApiOkResponse({ type: InstitutionDistributionResponseDto })
  async getInstitutionDistribution() {
    return this.dashboardService.getInstitutionDistribution();
  }

  @Get('institution-trends')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Institution onboarding timeline trends',
    description: 'Monthly onboarding counts for current vs previous year.',
  })
  @ApiOkResponse({ type: InstitutionTrendsResponseDto })
  async getInstitutionTrends(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getInstitutionTrends(query);
  }

  @Get('subject-combination-distribution')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Enrollment share across subject combinations',
    description: 'Breakdown of candidate registrations per subject combination with constituent subjects.',
  })
  @ApiOkResponse({ type: SubjectCombinationDistributionResponseDto })
  async getSubjectCombinationDistribution(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getSubjectCombinationDistribution(query, req.user?.user_id);
  }

  @Get('subject-enrollment')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Top enrolled subject combinations list',
    description: 'Returns top combinations ordered by candidate volume.',
  })
  async getSubjectEnrollment(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getSubjectEnrollment(query, req.user?.user_id);
  }

  @Get('enrollment-by-subject')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Candidate enrollment counted by individual subject',
    description: 'Total registrations across all combinations containing each specific subject.',
  })
  @ApiOkResponse({ type: [SubjectEnrollmentItemDto] })
  async getEnrollmentBySubject(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getEnrollmentBySubject(query, req.user?.user_id);
  }

  @Get('session-timeline')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Session timeline milestones & active window status',
    description: 'Registration intake timeline including open/close dates and cutoff deadlines.',
  })
  @ApiOkResponse({ type: SessionTimelineResponseDto })
  async getSessionTimeline(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getSessionTimeline(query, req.user?.user_id);
  }

  @Get('recent-registrations')
  @RequirePermission('reports.view')
  @ApiOperation({
    summary: 'Recently created or updated registrations',
    description: 'Latest candidate registrations with candidate code, avatar, biometric flag, and status.',
  })
  @ApiOkResponse({ type: [RecentRegistrationItemDto] })
  async getRecentRegistrations(@Query() query: DashboardQueryDto, @Req() req: any) {
    return this.dashboardService.getRecentRegistrations(query, req.user?.user_id);
  }

  @Patch(['/admin/users/:userId/jupeb-university', 'admin/users/:userId/jupeb-university'])
  @RequirePermission('profiles.jupeb_university_id')
  @ApiOperation({
    summary: 'Set institution scope on a user profile',
    description: 'Associates a user account with a specific JUPEB university or clears scope.',
  })
  async patchUserJupebUniversity(
    @Param('userId') userId: string,
    @Body() body: PatchUserJupebUniversityDto,
    @Req() req: any,
  ) {
    return this.dashboardService.patchUserJupebUniversity(
      userId,
      body.jupeb_university_id,
      req.user?.user_id,
    );
  }
}
