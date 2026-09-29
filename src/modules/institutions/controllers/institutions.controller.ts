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
import { InstitutionsService } from '../services/institutions.service';
import {
  CreateUniversityDto,
  PatchUniversityDto,
  ListUniversitiesQueryDto,
  ResendCredentialsDto,
} from '../dtos/university.dto';
import {
  UniversityResponseDto,
  BulkUploadResultDto,
} from '../dtos/university-responses.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../shared';

@ApiTags('Institutions & Universities')
@Controller()
export class InstitutionsController {
  constructor(private readonly institutionsService: InstitutionsService) {}

  @Get(['catalog/universities/public', 'institutions/public'])
  @ApiOperation({
    summary: 'List active universities for public preloading',
    description: 'Retrieves all active institutions for public dropdowns or registration intake forms.',
  })
  @ApiOkResponse({ type: [UniversityResponseDto] })
  async listPublic(@Query('type') type?: string) {
    return this.institutionsService.listPublic({ type });
  }

  @Get(['catalog/universities', 'institutions'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List institutions with administrative filters & enrollment stats',
    description: 'Paginated list of universities with active filters, search, and enrolled candidate counts for the session.',
  })
  @ApiOkResponse({ type: [UniversityResponseDto] })
  async listAdmin(@Query() query: ListUniversitiesQueryDto, @Req() req: any) {
    return this.institutionsService.listAdmin(query, req.user?.user_id);
  }

  @Get(['catalog/universities/:universityId', 'institutions/:universityId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get university details by ID',
    description: 'Returns full university profile, contact info, and quota limits.',
  })
  @ApiOkResponse({ type: UniversityResponseDto })
  async getById(@Param('universityId') universityId: string) {
    return this.institutionsService.getById(universityId);
  }

  @Post(['catalog/universities', 'institutions'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.create')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new institution and provision primary administrator',
    description: 'Creates university record, provisions institution_admin account, and triggers external sync.',
  })
  @ApiCreatedResponse({ type: UniversityResponseDto })
  async create(@Body() dto: CreateUniversityDto, @Req() req: any) {
    return this.institutionsService.create(dto, req.user?.user_id);
  }

  @Patch(['catalog/universities/:universityId', 'institutions/:universityId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update institution profile',
    description: 'Modifies institution metadata, capacity, contact, or prefix.',
  })
  @ApiOkResponse({ type: UniversityResponseDto })
  async patch(
    @Param('universityId') universityId: string,
    @Body() dto: PatchUniversityDto,
  ) {
    return this.institutionsService.patch(universityId, dto);
  }

  @Post(['catalog/universities/:universityId/activate', 'institutions/:universityId/activate'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Activate an institution',
    description: 'Enables institution participation and student registrations.',
  })
  @ApiOkResponse({ type: UniversityResponseDto })
  async activate(@Param('universityId') universityId: string) {
    return this.institutionsService.setStatus(universityId, 'active');
  }

  @Post(['catalog/universities/:universityId/deactivate', 'institutions/:universityId/deactivate'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.update')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Deactivate an institution',
    description: 'Suspends institution active status.',
  })
  @ApiOkResponse({ type: UniversityResponseDto })
  async deactivate(@Param('universityId') universityId: string) {
    return this.institutionsService.setStatus(universityId, 'inactive');
  }

  @Delete(['catalog/universities/:universityId', 'institutions/:universityId'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.delete')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Soft-delete an institution',
    description: 'Marks institution as deleted while maintaining historical referential integrity.',
  })
  @ApiOkResponse({ type: UniversityResponseDto })
  async delete(@Param('universityId') universityId: string) {
    return this.institutionsService.delete(universityId);
  }

  @Post(['catalog/universities/bulk', 'institutions/bulk'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('institutions.create')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Bulk upload universities via CSV',
    description: 'Processes CSV text to onboard multiple institutions and provision admins.',
  })
  @ApiConsumes('text/csv', 'application/json')
  @ApiBody({ schema: { type: 'object', properties: { csv: { type: 'string' } } } })
  @ApiOkResponse({ type: BulkUploadResultDto })
  async bulkUpload(@Body() body: any, @Req() req: any) {
    const csv = typeof req.csvText === 'string' && req.csvText
      ? req.csvText
      : typeof body === 'string'
      ? body
      : body?.csv || '';
    return this.institutionsService.bulkCreate(csv, req.user?.user_id);
  }

  @Post(['catalog/universities/resend-credentials', 'institutions/resend-credentials'])
  @ApiOperation({
    summary: 'Resend welcome credentials to institution admin',
    description: 'Generates a new secure password and emails onboarding details to the institution admin.',
  })
  @ApiOkResponse({ description: 'Welcome credentials email resent successfully' })
  async resendCredentials(@Body() dto: ResendCredentialsDto) {
    return this.institutionsService.resendCredentials(dto.email);
  }
}
