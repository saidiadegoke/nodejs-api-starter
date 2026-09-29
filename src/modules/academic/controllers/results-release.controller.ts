import {
  Controller,
  Get,
  Post,
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
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { ResultsReleaseService } from '../services/results-release.service';
import {
  ReleaseToInstitutionsDto,
  ReleaseToStudentsDto,
  InstitutionResultsQueryDto,
  ReleaseToInstitutionsResponseDto,
  ReleaseToStudentsResponseDto,
} from '../dto';

@ApiTags('Results Release (Two-Tier)')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('results-release')
export class ResultsReleaseController {
  constructor(private readonly resultsReleaseService: ResultsReleaseService) {}

  @Post('sessions/:sessionId/release-institutions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tier 1: Central JUPEB release of examination results to institutions',
    description: 'Central registrar triggers release of computed examination results to all participating universities.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkResponse({ type: ReleaseToInstitutionsResponseDto })
  async releaseToInstitutions(
    @CurrentUser('user_id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ReleaseToInstitutionsDto,
  ) {
    return this.resultsReleaseService.releaseToInstitutions(userId, {
      ...body,
      session_id: sessionId,
    });
  }

  @Get('sessions/:sessionId/institution-results')
  @ApiOperation({
    summary: 'Institution review: list university candidates with release status',
    description: 'Retrieves all candidate results under the institution for pre-release review.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkResponse({ description: 'Paginated candidate result records' })
  async getInstitutionResults(
    @CurrentUser('user_id') userId: string,
    @Param('sessionId') sessionId: string,
    @Query() query: InstitutionResultsQueryDto,
  ) {
    return this.resultsReleaseService.getInstitutionResults(userId, {
      ...query,
      session_id: sessionId,
    });
  }

  @Post('sessions/:sessionId/release-students')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tier 2: Institution release of results to enrolled students',
    description: 'Institution administrator publishes results to all candidates or selected cleared candidate registrations.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkResponse({ type: ReleaseToStudentsResponseDto })
  async releaseToStudents(
    @CurrentUser('user_id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: ReleaseToStudentsDto,
  ) {
    return this.resultsReleaseService.releaseToStudents(userId, {
      ...body,
      session_id: sessionId,
    });
  }
}
