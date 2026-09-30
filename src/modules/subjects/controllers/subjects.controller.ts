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
import { SubjectsService } from '../services/subjects.service';
import {
  CreateSubjectDto,
  PatchSubjectDto,
  ListSubjectsQueryDto,
} from '../dtos/subject.dto';
import {
  SubjectResponseDto,
  BulkSubjectResultDto,
} from '../dtos/subject-responses.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../utils';

@ApiTags('Subjects')
@Controller()
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get(['catalog/subjects/public', 'subjects/public'])
  @ApiOperation({
    summary: 'List active subjects for public selection',
    description: 'Returns active subject catalog list for candidate and registration forms.',
  })
  @ApiOkResponse({ type: [SubjectResponseDto] })
  async listPublic() {
    return this.subjectsService.listPublic();
  }

  @Get(['catalog/subjects', 'subjects'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List subjects with administrative filters and candidate counts',
    description: 'Paginated admin list of subjects with enrolled candidate counts.',
  })
  @ApiOkResponse({ type: [SubjectResponseDto] })
  async listAdmin(@Query() query: ListSubjectsQueryDto, @Req() req: any) {
    return this.subjectsService.listAdmin(query, req.user?.user_id);
  }

  @Get(['catalog/subjects/:subjectId', 'subjects/:subjectId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get subject details by ID',
    description: 'Retrieves subject info and code.',
  })
  @ApiOkResponse({ type: SubjectResponseDto })
  async getById(@Param('subjectId') subjectId: string) {
    return this.subjectsService.getById(subjectId);
  }

  @Post(['catalog/subjects', 'subjects'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.create')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subject in catalog',
    description: 'Adds a new subject code and title.',
  })
  @ApiCreatedResponse({ type: SubjectResponseDto })
  async create(@Body() dto: CreateSubjectDto) {
    return this.subjectsService.create(dto);
  }

  @Patch(['catalog/subjects/:subjectId', 'subjects/:subjectId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update subject code or syllabus description',
    description: 'Modifies subject details.',
  })
  @ApiOkResponse({ type: SubjectResponseDto })
  async patch(@Param('subjectId') subjectId: string, @Body() dto: PatchSubjectDto) {
    return this.subjectsService.patch(subjectId, dto);
  }

  @Post(['catalog/subjects/:subjectId/activate', 'subjects/:subjectId/activate'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Activate subject',
    description: 'Marks subject as active for registration.',
  })
  @ApiOkResponse({ type: SubjectResponseDto })
  async activate(@Param('subjectId') subjectId: string) {
    return this.subjectsService.setStatus(subjectId, 'active');
  }

  @Post(['catalog/subjects/:subjectId/deactivate', 'subjects/:subjectId/deactivate'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Deactivate subject',
    description: 'Disables subject from future registrations.',
  })
  @ApiOkResponse({ type: SubjectResponseDto })
  async deactivate(@Param('subjectId') subjectId: string) {
    return this.subjectsService.setStatus(subjectId, 'inactive');
  }

  @Delete(['catalog/subjects/:subjectId', 'subjects/:subjectId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.delete')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Soft-delete subject',
    description: 'Removes subject from catalog while keeping historical registration links.',
  })
  @ApiOkResponse({ type: SubjectResponseDto })
  async delete(@Param('subjectId') subjectId: string) {
    return this.subjectsService.delete(subjectId);
  }

  @Post(['catalog/subjects/bulk', 'subjects/bulk'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('subject.create')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Bulk create subjects via CSV',
    description: 'Uploads and creates multiple subjects at once.',
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
    return this.subjectsService.bulkCreate(csv);
  }
}
