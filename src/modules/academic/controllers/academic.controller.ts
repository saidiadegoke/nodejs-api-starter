import {
  Controller,
  Get,
  Post,
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
import { AcademicService } from '../services/academic.service';
import {
  UpsertResultsDto,
  RegistrationResultItemResponseDto,
  ScoreBreakdownResponseDto,
  ScoreSnapshotDto,
} from '../dto';

@ApiTags('Academic Results & Scores')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('academic')
export class AcademicController {
  constructor(private readonly academicService: AcademicService) {}

  @Get('results/:registrationId')
  @ApiOperation({
    summary: 'List candidate registered course results',
    description: 'Retrieves all course grades awarded to candidate for their active academic registration.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ type: [RegistrationResultItemResponseDto] })
  async listResults(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.academicService.listResults(registrationId, userId);
  }

  @Post('results/:registrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enter or update course grades for candidate',
    description: 'Registrar/Admin enters course grades (A–F) and recomputes cumulative snapshot.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ type: [RegistrationResultItemResponseDto] })
  async upsertResults(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
    @Body() body: UpsertResultsDto,
  ) {
    return this.academicService.upsertResults(registrationId, body, userId);
  }

  @Get('score/:registrationId')
  @ApiOperation({
    summary: 'Get candidate aggregate score breakdown',
    description: 'Computes passed courses, failed courses, and +1 points tally from candidate results.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ type: ScoreBreakdownResponseDto })
  async getScore(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.academicService.getScore(registrationId, userId);
  }

  @Post('score/:registrationId/recompute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recompute and persist score snapshot',
    description: 'Forces recalculation and persistence of aggregate academic score snapshot.',
  })
  @ApiParam({ name: 'registrationId', type: String })
  @ApiOkResponse({ type: ScoreSnapshotDto })
  async recomputeScore(
    @CurrentUser('user_id') userId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.academicService.recomputeScore(registrationId, userId);
  }
}
