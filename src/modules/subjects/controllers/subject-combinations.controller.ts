import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
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
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { SubjectCombinationsService } from '../services/subject-combinations.service';
import {
  CreateSubjectCombinationDto,
  PatchSubjectCombinationDto,
  ListSubjectCombinationsQueryDto,
} from '../dtos/subject-combination.dto';
import {
  SubjectCombinationResponseDto,
  BulkSubjectResultDto,
} from '../dtos/subject-responses.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../shared';

@ApiTags('Subject Combinations')
@Controller()
export class SubjectCombinationsController {
  constructor(
    private readonly combinationService: SubjectCombinationsService,
  ) {}

  @Get(['catalog/subject-combinations/public', 'subject-combinations/public'])
  @ApiOperation({
    summary: 'List active subject combinations for candidate registration',
    description: 'Returns available subject combinations (global or university-scoped) with ordered subject items.',
  })
  @ApiOkResponse({ type: [SubjectCombinationResponseDto] })
  async listPublic(@Query('university_id') universityId?: string) {
    return this.combinationService.listPublic({ universityId });
  }

  @Get(['catalog/subject-combinations', 'subject-combinations'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List subject combinations with administrative filters and candidate counts',
    description: 'Paginated admin list of subject combinations with constituent subjects and enrolled count.',
  })
  @ApiOkResponse({ type: [SubjectCombinationResponseDto] })
  async listAdmin(@Query() query: ListSubjectCombinationsQueryDto) {
    return this.combinationService.listAdmin(query);
  }

  @Get(['catalog/subject-combinations/:subjectCombinationId', 'subject-combinations/:subjectCombinationId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get subject combination by ID with constituent subject items',
    description: 'Returns combination info and list of subjects.',
  })
  @ApiOkResponse({ type: SubjectCombinationResponseDto })
  async getById(
    @Param('subjectCombinationId') subjectCombinationId: string,
  ) {
    return this.combinationService.getById(subjectCombinationId, { embedItems: true });
  }

  @Post(['catalog/subject-combinations', 'subject-combinations'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.create')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subject combination',
    description: 'Validates 3–6 unique subjects and links them in sequence.',
  })
  @ApiCreatedResponse({ type: SubjectCombinationResponseDto })
  async create(@Body() dto: CreateSubjectCombinationDto) {
    return this.combinationService.create(dto);
  }

  @Patch(['catalog/subject-combinations/:subjectCombinationId', 'subject-combinations/:subjectCombinationId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update subject combination or its subjects membership',
    description: 'Modifies title, scope, or replaces constituent subjects.',
  })
  @ApiOkResponse({ type: SubjectCombinationResponseDto })
  async patch(
    @Param('subjectCombinationId') subjectCombinationId: string,
    @Body() dto: PatchSubjectCombinationDto,
  ) {
    return this.combinationService.patch(subjectCombinationId, dto);
  }

  @Post([
    'catalog/subject-combinations/:subjectCombinationId/activate',
    'subject-combinations/:subjectCombinationId/activate',
  ])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Activate subject combination',
    description: 'Makes subject combination selectable by students.',
  })
  @ApiOkResponse({ type: SubjectCombinationResponseDto })
  async activate(
    @Param('subjectCombinationId') subjectCombinationId: string,
  ) {
    return this.combinationService.setStatus(subjectCombinationId, 'active');
  }

  @Post([
    'catalog/subject-combinations/:subjectCombinationId/deactivate',
    'subject-combinations/:subjectCombinationId/deactivate',
  ])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Deactivate subject combination',
    description: 'Disables combination for future student selections.',
  })
  @ApiOkResponse({ type: SubjectCombinationResponseDto })
  async deactivate(
    @Param('subjectCombinationId') subjectCombinationId: string,
  ) {
    return this.combinationService.setStatus(subjectCombinationId, 'inactive');
  }

  @Delete([
    'catalog/subject-combinations/:subjectCombinationId',
    'subject-combinations/:subjectCombinationId',
  ])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.delete')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Soft-delete subject combination',
    description: 'Archives combination while preserving historical candidate selections.',
  })
  @ApiOkResponse({ type: SubjectCombinationResponseDto })
  async delete(
    @Param('subjectCombinationId') subjectCombinationId: string,
  ) {
    return this.combinationService.delete(subjectCombinationId);
  }

  @Post(['catalog/subject-combinations/bulk', 'subject-combinations/bulk'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject_combinations.create')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Bulk create subject combinations via CSV',
    description: 'Uploads and creates multiple subject combinations with subject list strings.',
  })
  @ApiConsumes('text/csv', 'application/json')
  @ApiBody({ schema: { type: 'object', properties: { csv: { type: 'string' } } } })
  @ApiOkResponse({ type: BulkSubjectResultDto })
  async bulkUpload(@Body() body: any, @Req() req: any) {
    const csv = typeof req.csvText === 'string' && req.csvText
      ? req.csvText
      : typeof body === 'string'
      ? body
      : body?.csv || '';
    return this.combinationService.bulkCreate(csv);
  }
}
