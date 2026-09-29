import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { ResultEntriesService } from '../services/result-entries.service';
import {
  BulkResultEntriesDto,
  PatchResultEntryDto,
  ResultEntriesListResponseDto,
  ResultEntryResponseDto,
} from '../dto';

@ApiTags('Examination Result Entries')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('submission')
export class ResultEntriesController {
  constructor(private readonly resultEntriesService: ResultEntriesService) {}

  @Get('me/result-entries')
  @ApiOperation({
    summary: 'List candidate manual examination certificate entries',
    description: 'Retrieves all manual subject and grade entries for candidate intake verification.',
  })
  @ApiOkResponse({ type: ResultEntriesListResponseDto })
  async listMine(@CurrentUser('user_id') userId: string) {
    return this.resultEntriesService.listMine(userId);
  }

  @Post('me/result-entries')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save/upsert candidate manual examination certificate entries',
    description: 'Bulk upserts candidate manual certificate subjects with normalized grades (A–F).',
  })
  @ApiOkResponse({ type: ResultEntriesListResponseDto })
  async upsertMine(
    @CurrentUser('user_id') userId: string,
    @Body() body: BulkResultEntriesDto,
  ) {
    return this.resultEntriesService.upsertMine(userId, body);
  }

  @Patch('me/result-entries/:entryId')
  @ApiOperation({
    summary: 'Override single candidate examination entry',
    description: 'Updates a single manual certificate subject entry and locks origin to manual.',
  })
  @ApiParam({ name: 'entryId', type: String })
  @ApiOkResponse({ type: ResultEntryResponseDto })
  async patchMine(
    @CurrentUser('user_id') userId: string,
    @Param('entryId') entryId: string,
    @Body() body: PatchResultEntryDto,
  ) {
    return this.resultEntriesService.patchMineEntry(userId, entryId, body);
  }

  @Get('institution/registrations/:registrationId/result-entries')
  @ApiOperation({
    summary: 'Institution review: list candidate examination result entries with OCR confidence',
    description: 'Retrieves grouped result entries with OCR confidence scores for registrar verification.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ type: ResultEntriesListResponseDto })
  async listForInstitution(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.resultEntriesService.listForInstitution(userId, registrationId);
  }

  @Patch('institution/result-entries/:entryId')
  @ApiOperation({
    summary: 'Institution review: override candidate result entry',
    description: 'Registrar modifies grade/subject/score and sets origin to manual to prevent OCR overwrite.',
  })
  @ApiParam({ name: 'entryId', type: String })
  @ApiOkResponse({ type: ResultEntryResponseDto })
  async patchInstitutionEntry(
    @CurrentUser('user_id') userId: string,
    @Param('entryId') entryId: string,
    @Body() body: PatchResultEntryDto,
  ) {
    return this.resultEntriesService.patchInstitutionEntry(userId, entryId, body);
  }
}
