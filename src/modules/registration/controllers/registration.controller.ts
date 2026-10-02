import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { RegistrationService } from '../services/registration.service';
import { BulkRegistrationService } from '../services/bulk-registration.service';
import {
  CreateRegistrationDto,
  PatchRegistrationDto,
  PatchCandidateDto,
  ListRegistrationsQueryDto,
  ClaimCodeDto,
  ConfirmSubjectsDto,
  BatchRegistrationActionDto,
  RegistrationListItemDto,
  RegistrationOverviewStatsDto,
  CodeStatusResponseDto,
  SubmissionPreviewResponseDto,
} from '../dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../utils';

@ApiTags('Registrations & Candidates')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(['registration', 'jupeb/registration'])
export class RegistrationController {
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly bulkRegistrationService: BulkRegistrationService,
  ) {}

  @Get('sessions/:sessionId/numbering-preview')
  @RequirePermission('sessions.update')
  @ApiOperation({
    summary: 'Preview candidate matric numbers for session',
    description: 'Generates sequence simulation for final candidate numbers prior to batch lock.',
  })
  async previewCandidateNumbering(@Param('sessionId') sessionId: string) {
    return this.registrationService.previewCandidateNumbering(sessionId);
  }

  @Post('institution/registrations/bulk-upload')
  @RequirePermission('candidate.create', 'jupeb.registration.manage')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Bulk upload candidates via CSV / Excel spreadsheet',
    description: 'Parses tabular file, extracts 11-digit NINs, assigns provisional candidate codes, and creates registration records.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        session_id: { type: 'string', format: 'uuid' },
        university_id: { type: 'string', format: 'uuid' },
      },
    },
  })
  async bulkUploadCandidates(
    @UploadedFile() file: any,
    @Body('session_id') sessionId: string,
    @Body('university_id') universityId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.bulkRegistrationService.bulkUpload(file?.buffer, sessionId, universityId, userId);
  }

  @Post('institution/registrations')
  @RequirePermission('candidate.create', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Create individual candidate registration',
    description: 'Registers a candidate, assigns next provisional serial and 7-digit candidate code.',
  })
  @ApiCreatedResponse({
    type: RegistrationListItemDto,
  })
  async createRegistration(
    @Body() dto: CreateRegistrationDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.createRegistration(dto, userId);
  }

  @Patch('institution/registrations/:registrationId')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Update candidate registration record',
    description: 'Updates assigned subject combination, institution issued code, or status remarks.',
  })
  async updateRegistration(
    @Param('registrationId') registrationId: string,
    @Body() dto: PatchRegistrationDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.updateRegistration(registrationId, dto, userId);
  }

  @Patch('institution/registrations/:registrationId/candidate')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Update candidate profile information',
    description: 'Updates student demographic and profile data.',
  })
  async updateCandidateProfile(
    @Param('registrationId') registrationId: string,
    @Body() dto: PatchCandidateDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.updateCandidateProfile(registrationId, dto, userId);
  }

  @Post('institution/registrations/:registrationId/resend-code')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Resend registration provisional code to candidate',
    description: 'Dispatches provisional access code via SMS/Email to the student.',
  })
  async resendProvisionalCode(
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.resendProvisionalCode(registrationId, userId);
  }

  @Delete('institution/registrations/:registrationId')
  @RequirePermission('candidate.delete', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Withdraw / delete candidate registration',
    description: 'Transitions registration status to withdrawn.',
  })
  async withdrawRegistration(
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.withdrawRegistration(registrationId, userId);
  }

  @Get('institution/registrations')
  @RequirePermission('candidate.view', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'List registrations with institution filters',
    description: 'Paginated list of candidates with session, biometrics, and status filters.',
  })
  @ApiOkResponse({
    type: [RegistrationListItemDto],
  })
  async listRegistrations(
    @Query() query: ListRegistrationsQueryDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    const result = await this.registrationService.listRegistrations(query, userId);
    const totalPages = Math.ceil(result.total / (result.limit || 20));
    return {
      success: true,
      message: 'Registrations retrieved successfully',
      data: result.rows,
      registrations: result.rows,
      rows: result.rows,
      total: result.total,
      page: result.page,
      limit: result.limit,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages,
        total_pages: totalPages,
      },
    };
  }

  @Get('institution/registrations/export')
  @RequirePermission('candidate.view', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Export filtered candidate registrations to CSV',
  })
  async exportRegistrationsCsv(
    @Query() query: ListRegistrationsQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    const csv = await this.registrationService.exportRegistrationsCsv(query, userId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="candidates.csv"');
    res.status(HttpStatus.OK).send(csv);
  }

  @Get('institution/registrations/:registrationId')
  @RequirePermission('candidate.view', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Get candidate registration details',
    description: 'Retrieves complete registration profile, supporting documents, and workflow history.',
  })
  async getRegistrationById(
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getRegistrationById(registrationId, userId);
  }

  @Get('institution/overview/stats')
  @RequirePermission('candidate.view', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Get registration KPI counts for institution dashboard',
    description: 'Returns total, approved, pending, rejected, and biometrics coverage counts.',
  })
  @ApiOkResponse({
    type: RegistrationOverviewStatsDto,
  })
  async getOverviewStats(
    @Query() query: any,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getOverviewStats(query, userId);
  }

  @Get('institution/overview/by-university')
  @RequirePermission('candidate.view', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Get registration breakdown by university',
  })
  async getRegistrationsByUniversity(
    @Query() query: any,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    const rows = await this.registrationService.getRegistrationsByUniversity(query, userId);
    return {
      success: true,
      message: 'Registrations by university retrieved successfully',
      data: rows,
      rows,
      total: rows.length,
    };
  }

  @Post('institution/registrations/batch')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Execute batch status action on multiple registrations',
  })
  async batchUpdateRegistrationStatus(
    @Body() dto: BatchRegistrationActionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.batchUpdateRegistrationStatus(dto, userId);
  }

  @Post('institution/registrations/:registrationId/approve')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Approve candidate registration',
    description: 'Clears candidate for final matric number generation.',
  })
  async approveRegistration(
    @Param('registrationId') registrationId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.approveRegistration(registrationId, body, userId);
  }

  @Post('institution/registrations/:registrationId/reject')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Reject candidate registration',
  })
  async rejectRegistration(
    @Param('registrationId') registrationId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.rejectRegistration(registrationId, body, userId);
  }

  @Post('institution/registrations/:registrationId/withdraw')
  @RequirePermission('candidate.update', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Withdraw candidate registration',
  })
  async withdrawRegistrationDirect(
    @Param('registrationId') registrationId: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.withdrawRegistrationDirect(registrationId, body, userId);
  }

  // ─────────────────────────────── Student Self-Service Routes (/me/*) ───────────────────────────────

  @Get('me/code-status')
  @ApiOperation({
    summary: 'Get candidate code claim status',
  })
  @ApiOkResponse({
    type: CodeStatusResponseDto,
  })
  async getStudentCodeStatus(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getStudentCodeStatus(userId);
  }

  @Post('me/claim-code')
  @ApiOperation({
    summary: 'Claim registration provisional code',
    description: 'Links provisional registration record to authenticated candidate account.',
  })
  async claimProvisionalCode(
    @Body() dto: ClaimCodeDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.claimProvisionalCode(dto.code, userId);
  }

  @Get('me/current')
  @ApiOperation({
    summary: 'Get current candidate registration summary',
  })
  async getCurrentStudentRegistration(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getCurrentStudentRegistration(userId);
  }

  @Get('me/profile')
  @ApiOperation({
    summary: 'Get student registration profile',
  })
  async getStudentProfile(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getStudentProfile(userId);
  }

  @Get('me/submission-preview')
  @ApiOperation({
    summary: 'Get registration submission readiness checklist',
  })
  @ApiOkResponse({
    type: SubmissionPreviewResponseDto,
  })
  async getSubmissionPreview(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getSubmissionPreview(userId);
  }

  @Get('me/exam-results')
  @ApiOperation({
    summary: 'Get candidate exam results and subject scores',
  })
  async getStudentExamResults(@Req() req: any, @Query() query?: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getStudentExamResults(userId, query);
  }

  @Get('me/slip')
  @ApiOperation({
    summary: 'Get registration examination slip metadata',
  })
  async getRegistrationSlipSummary(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getRegistrationSlipSummary(userId);
  }

  @Get('me/slip/download')
  @ApiOperation({
    summary: 'Download registration examination slip PDF',
  })
  async downloadRegistrationSlipPdf(
    @Query('registration_id') registrationId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.registrationService.downloadRegistrationSlipPdf(registrationId, token);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="registration-slip.pdf"');
    res.status(HttpStatus.OK).send(pdfBuffer);
  }

  @Patch('me/academic-intake')
  @ApiOperation({
    summary: 'Update student academic subject selection',
  })
  async updateSubjectCombination(
    @Body() dto: { subject_combination_id?: string },
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.updateSubjectCombination(dto, userId);
  }

  @Patch('me/profile')
  @ApiOperation({
    summary: 'Update candidate profile information',
  })
  async updateStudentProfile(
    @Body() dto: PatchCandidateDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.updateStudentProfile(dto, userId);
  }

  @Get('me/registration-form.pdf')
  @ApiOperation({
    summary: 'Generate registration form PDF preview',
  })
  async getRegistrationFormPdf(
    @Req() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    const preview = await this.registrationService.getSubmissionPreview(userId);
    const pdfBuffer = await this.registrationService.downloadRegistrationSlipPdf(preview.registration_id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="registration-form.pdf"');
    res.status(HttpStatus.OK).send(pdfBuffer);
  }

  @Post('me/confirm-subjects')
  @ApiOperation({
    summary: 'Lock candidate subject combination selection',
  })
  async confirmSubjectCombination(
    @Body() dto: ConfirmSubjectsDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.confirmSubjectCombination(dto, userId);
  }

  @Post('me/submit')
  @ApiOperation({
    summary: 'Submit candidate registration for institution review',
  })
  async submitRegistration(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.submitRegistration(userId);
  }

  @Get('me/dashboard-access')
  @ApiOperation({
    summary: 'Check whether candidate dashboard features are unlocked',
  })
  async getDashboardAccessStatus(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.registrationService.getDashboardAccessStatus(userId);
  }
}
