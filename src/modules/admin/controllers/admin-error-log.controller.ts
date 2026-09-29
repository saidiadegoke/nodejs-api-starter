import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils';
import { AdminErrorLogService } from '../services/admin-error-log.service';
import {
  ListErrorLogsQueryDto,
  ErrorLogStatsResponseDto,
  ListErrorLogsResponseDto,
  RequestLogItemDto,
} from '../dto';

@ApiTags('Admin Error & Request Logs')
@Controller('admin/error-logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class AdminErrorLogController {
  constructor(private readonly errorLogService: AdminErrorLogService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'Error / traffic stats',
    description: 'Aggregate counts: total errors, server/client errors, slow requests, today/last-hour.',
  })
  @ApiOkResponse({ type: ErrorLogStatsResponseDto })
  async getStats() {
    return this.errorLogService.getStats();
  }

  @Get()
  @ApiOperation({
    summary: 'List error / request logs',
    description: 'Paginated list with filtering by type, method, path, and date range.',
  })
  @ApiOkResponse({ type: ListErrorLogsResponseDto })
  async list(@Query() query: ListErrorLogsQueryDto) {
    return this.errorLogService.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get single log entry',
    description: 'Returns full request log detail including bodies.',
  })
  @ApiOkResponse({ type: RequestLogItemDto })
  async getById(@Param('id') id: string) {
    return this.errorLogService.getById(id);
  }
}
