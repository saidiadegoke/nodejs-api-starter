import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils/guards/jwt-auth.guard';
import { CurrentUser } from '../../../utils/decorators/current-user.decorator';
import { Audit } from '../../../utils/decorators/audit.decorator';
import { SubmissionService } from '../services/submission.service';
import {
  AttachDocumentDto,
  PatchDocumentDto,
  ValidateCompletenessDto,
  ReviewDocumentDto,
  SubmissionDocumentResponseDto,
  RequirementWithCompletionDto,
  CompletenessResponseDto,
  DocumentDownloadUrlResponseDto,
} from '../dto';

@ApiTags('Document Submissions')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('submission')
export class SubmissionController {
  constructor(private readonly submissionService: SubmissionService) {}

  @Get('me/requirements')
  @ApiOperation({
    summary: 'Candidate intake document requirements with fulfillment status',
    description: 'Returns active document requirements and flags whether the student has satisfied each requirement.',
  })
  @ApiQuery({ name: 'registration_id', required: false, type: String })
  @ApiOkResponse({ type: [RequirementWithCompletionDto] })
  async getMeRequirements(
    @CurrentUser('user_id') userId: string,
    @Query('registration_id') registrationId?: string,
  ) {
    return this.submissionService.getMeRequirements(userId, registrationId);
  }

  @Get('me/documents')
  @ApiOperation({
    summary: 'List candidate uploaded documents',
    description: 'Retrieves all document attachments submitted for the candidate registration.',
  })
  @ApiQuery({ name: 'registration_id', required: false, type: String })
  @ApiOkResponse({ type: [SubmissionDocumentResponseDto] })
  async listMeDocuments(
    @CurrentUser('user_id') userId: string,
    @Query('registration_id') registrationId?: string,
  ) {
    return this.submissionService.listMeDocuments(userId, registrationId);
  }

  @Post('me/documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Attach document to candidate registration',
    description: 'Attaches an uploaded file to an active document requirement. Triggers OCR validation for exam certificates.',
  })
  @ApiCreatedResponse({ type: SubmissionDocumentResponseDto })
  async attachMeDocument(
    @CurrentUser('user_id') userId: string,
    @Body() body: AttachDocumentDto,
  ) {
    return this.submissionService.attachMeDocument(userId, body);
  }

  @Patch('me/documents/:documentId')
  @ApiOperation({
    summary: 'Replace candidate document attachment',
    description: 'Replaces an existing submitted document with a new uploaded file.',
  })
  @ApiParam({ name: 'documentId', type: String })
  @ApiOkResponse({ type: SubmissionDocumentResponseDto })
  async patchMeDocument(
    @CurrentUser('user_id') userId: string,
    @Param('documentId') documentId: string,
    @Body() body: PatchDocumentDto,
  ) {
    return this.submissionService.patchMeDocument(userId, documentId, body);
  }

  @Delete('me/documents/:documentId')
  @ApiOperation({
    summary: 'Delete candidate document attachment',
    description: 'Soft-deletes a submitted document attachment if pending review.',
  })
  @ApiParam({ name: 'documentId', type: String })
  @ApiOkResponse({ description: 'Document marked deleted' })
  async deleteMeDocument(
    @CurrentUser('user_id') userId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.submissionService.deleteMyDocument(userId, documentId);
  }

  @Get('me/documents/:documentId/download-url')
  @ApiOperation({
    summary: 'Generate short-lived signed download URL for document',
    description: 'Returns a time-limited download URL for candidate verification.',
  })
  @ApiParam({ name: 'documentId', type: String })
  @ApiOkResponse({ type: DocumentDownloadUrlResponseDto })
  async downloadUrlMine(
    @CurrentUser('user_id') userId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.submissionService.downloadUrlMine(userId, documentId);
  }

  @Post('me/validate-completeness')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validate candidate intake submission completeness',
    description: 'Checks if all mandatory documents have been uploaded and accepted.',
  })
  @ApiOkResponse({ type: CompletenessResponseDto })
  async validateCompleteness(
    @CurrentUser('user_id') userId: string,
    @Body() body: ValidateCompletenessDto,
  ) {
    return this.submissionService.validateCompleteness(userId, body.registration_id);
  }

  @Get('institution/registrations/:registrationId/documents')
  @ApiOperation({
    summary: 'Institution review: list candidate documents',
    description: 'Retrieves all document attachments submitted for a candidate registration under review.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ type: [SubmissionDocumentResponseDto] })
  async institutionListDocuments(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.submissionService.institutionListDocuments(userId, registrationId);
  }

  @Post('institution/documents/:documentId/accept')
  @HttpCode(HttpStatus.OK)
  @Audit('document.review_accept', {
    resourceType: 'document',
    resourceId: 'params:documentId',
    details: ({ req }) => ({ status: 'accepted', review_note: req.body?.review_note }),
  })
  @ApiOperation({
    summary: 'Institution review: accept document',
    description: 'Marks candidate document as accepted.',
  })
  @ApiParam({ name: 'documentId', type: String })
  @ApiOkResponse({ type: SubmissionDocumentResponseDto })
  async institutionAccept(
    @CurrentUser('user_id') userId: string,
    @Param('documentId') documentId: string,
    @Body() body: ReviewDocumentDto,
  ) {
    return this.submissionService.institutionReviewDocument(
      userId,
      documentId,
      'accepted',
      body.review_note,
    );
  }

  @Post('institution/documents/:documentId/reject')
  @HttpCode(HttpStatus.OK)
  @Audit('document.review_reject', {
    resourceType: 'document',
    resourceId: 'params:documentId',
    details: ({ req }) => ({ status: 'rejected', review_note: req.body?.review_note }),
  })
  @ApiOperation({
    summary: 'Institution review: reject document',
    description: 'Marks candidate document as rejected with feedback reason.',
  })
  @ApiParam({ name: 'documentId', type: String })
  @ApiOkResponse({ type: SubmissionDocumentResponseDto })
  async institutionReject(
    @CurrentUser('user_id') userId: string,
    @Param('documentId') documentId: string,
    @Body() body: ReviewDocumentDto,
  ) {
    return this.submissionService.institutionReviewDocument(
      userId,
      documentId,
      'rejected',
      body.review_note,
    );
  }
}
