import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CrmsService } from '../services/crms.service';
import { JwtAuthGuard } from '../../../utils';

@ApiTags('CRMS')
@Controller('crms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class CrmsController {
  constructor(private readonly crmsService: CrmsService) {}

  @Get(['home-summary', 'home'])
  @ApiOperation({ summary: 'CRMS student home summary' })
  async getHomeSummary(@Req() req: any) {
    return this.crmsService.getHomeSummary(req.user?.user_id);
  }

  @Get('courses')
  @ApiOperation({ summary: 'CRMS enrolled courses' })
  async getCourses(@Req() req: any) {
    return this.crmsService.getCourses(req.user?.user_id);
  }

  @Get('results')
  @ApiOperation({ summary: 'CRMS released student results' })
  async getResults(@Req() req: any) {
    return this.crmsService.getResults(req.user?.user_id);
  }

  @Post('sync-candidates')
  @ApiOperation({ summary: 'Sync candidates to CRMS' })
  async syncCandidates(@Body() body: any) {
    return this.crmsService.syncCandidates(body);
  }

  @Post('sync-institutions')
  @ApiOperation({ summary: 'Sync institutions to CRMS' })
  async syncInstitutions(@Body() body: any) {
    return this.crmsService.syncInstitutions(body);
  }
}
