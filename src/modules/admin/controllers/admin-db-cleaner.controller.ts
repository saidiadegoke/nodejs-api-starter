import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils';
import { AdminDbCleanerService } from '../services/admin-db-cleaner.service';
import { ClearDbDto, ClearDbResultDto } from '../dto';

@ApiTags('Admin System / Database Cleanup')
@Controller('admin/system')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class AdminDbCleanerController {
  constructor(private readonly cleanerService: AdminDbCleanerService) {}

  @Get('clear-db/tables')
  @ApiOperation({
    summary: 'List clearable table groups',
    description: 'Returns the configured table groups and protected admin roles for preview before clearing.',
  })
  @ApiOkResponse({ description: 'Table group configuration.' })
  async listTables() {
    return this.cleanerService.getConfiguredTables();
  }

  @Post('clear-db')
  @ApiOperation({
    summary: 'Clear database records',
    description:
      'Clears registration/candidate data scoped to a session or all operational data. ' +
      'confirm must be "CONFIRM_DELETE". Admin users are always preserved.',
  })
  @ApiOkResponse({ type: ClearDbResultDto })
  async clearDb(@Body() dto: ClearDbDto) {
    return this.cleanerService.clearDb(dto);
  }
}
