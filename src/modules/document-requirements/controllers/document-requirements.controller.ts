import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
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
import { DocumentRequirementsService } from '../services/document-requirements.service';
import {
  CreateDocumentRequirementDto,
  PatchDocumentRequirementDto,
  ListDocumentRequirementsQueryDto,
  DocumentRequirementResponseDto,
} from '../dtos/document-requirement.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../shared';

@ApiTags('Document Requirements')
@Controller()
export class DocumentRequirementsController {
  constructor(
    private readonly docReqService: DocumentRequirementsService,
  ) {}

  @Get(['submission/me/requirements', 'document-requirements/me'])
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List active document requirements for student intake',
    description: 'Returns mandatory and optional document requirements that candidates must upload.',
  })
  @ApiOkResponse({ type: [DocumentRequirementResponseDto] })
  async getMeRequirements() {
    return this.docReqService.listActive();
  }

  @Get(['submission/requirements', 'document-requirements'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.submission.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List document requirements for admin management',
    description: 'Paginated admin list of document requirements.',
  })
  @ApiOkResponse({ type: [DocumentRequirementResponseDto] })
  async listAdmin(@Query() query: ListDocumentRequirementsQueryDto) {
    return this.docReqService.listAdmin(query);
  }

  @Get(['submission/requirements/:requirementId', 'document-requirements/:requirementId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.submission.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get document requirement by ID',
    description: 'Returns requirement configuration details.',
  })
  @ApiOkResponse({ type: DocumentRequirementResponseDto })
  async getById(@Param('requirementId') requirementId: string) {
    return this.docReqService.getById(requirementId);
  }

  @Post(['submission/requirements', 'document-requirements'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.submission.manage')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new document requirement',
    description: 'Configures a new required document type, allowed mime types, and file size limits.',
  })
  @ApiCreatedResponse({ type: DocumentRequirementResponseDto })
  async create(@Body() dto: CreateDocumentRequirementDto) {
    return this.docReqService.create(dto);
  }

  @Patch(['submission/requirements/:requirementId', 'document-requirements/:requirementId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.submission.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update document requirement properties',
    description: 'Updates requirement rules, max size, or mandatory flag.',
  })
  @ApiOkResponse({ type: DocumentRequirementResponseDto })
  async patch(
    @Param('requirementId') requirementId: string,
    @Body() dto: PatchDocumentRequirementDto,
  ) {
    return this.docReqService.patch(requirementId, dto);
  }

  @Post([
    'submission/requirements/:requirementId/activate',
    'document-requirements/:requirementId/activate',
  ])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.submission.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Activate document requirement',
    description: 'Enforces requirement for upcoming candidate registrations.',
  })
  @ApiOkResponse({ type: DocumentRequirementResponseDto })
  async activate(@Param('requirementId') requirementId: string) {
    return this.docReqService.setStatus(requirementId, 'active');
  }

  @Post([
    'submission/requirements/:requirementId/deactivate',
    'document-requirements/:requirementId/deactivate',
  ])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.submission.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Deactivate document requirement',
    description: 'Disables requirement from student intake form.',
  })
  @ApiOkResponse({ type: DocumentRequirementResponseDto })
  async deactivate(@Param('requirementId') requirementId: string) {
    return this.docReqService.setStatus(requirementId, 'inactive');
  }
}
