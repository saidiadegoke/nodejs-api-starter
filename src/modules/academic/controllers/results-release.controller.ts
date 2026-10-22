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
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils/guards/jwt-auth.guard';
import { CurrentUser } from '../../../utils/decorators/current-user.decorator';
import { ResultsReleaseService } from '../services/results-release.service';
import {
  ReleaseToInstitutionsDto,
  ReleaseToStudentsDto,
  InstitutionResultsQueryDto,
  ReleaseToInstitutionsResponseDto,
  ReleaseToStudentsResponseDto,
  RequestReleaseOtpDto,
  RequestReleaseOtpResponseDto,
} from '../dto';

@ApiTags('Results Release (Two-Tier)')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('results-release')
export class ResultsReleaseController {
  constructor(private readonly resultsReleaseService: ResultsReleaseService) {}

  @Post('sessions/:sessionId/request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP authorization code to release examination results',
    description: 'Dispatches a 6-digit OTP code to the administrator before releasing results.',
  })
  @ApiParam({ name: 'sessionId', type: String })
  @ApiOkResponse({ type: RequestReleaseOtpResponseDto })
  async requestReleaseOtp(
    @CurrentUser('user_id') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: RequestReleaseOtpDto,
    @Req() req: any,
  ) {
    return this.resultsReleaseService.requestReleaseOtp(
      userId,
      {
        ...body,
        session_id: sessionId,
      },
      {
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
        userAgent: req?.headers?.['user-agent'],
      },
    );
  }

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP authorization code to release examination results (session_id in body)',
    description: 'Dispatches a 6-digit OTP code to the administrator before releasing results.',
  })
  @ApiOkResponse({ type: RequestReleaseOtpResponseDto })
  async requestReleaseOtpBody(
    @CurrentUser('user_id') userId: string,
    @Body() body: RequestReleaseOtpDto,
    @Req() req: any,
  ) {
    return this.resultsReleaseService.requestReleaseOtp(
      userId,
      body,
      {
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
        userAgent: req?.headers?.['user-agent'],
      },
    );
  }

  @Post('sessions/:sessionId/release-institutions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tier 1: Central JUPEB release of examination results to institutions (OTP gated)',
    description: 'Central registrar triggers release of computed examination results to all participating universities with OTP authorization.',
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
    summary: 'Tier 2: Institution release of results to enrolled students (OTP gated)',
    description: 'Institution administrator publishes results to all candidates or selected cleared candidate registrations with OTP authorization.',
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
