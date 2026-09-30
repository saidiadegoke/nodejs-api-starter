import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SyncService } from '../services/sync.service';
import {
  ListSyncLogsQueryDto,
  TriggerCandidateSyncDto,
  TriggerSubjectSyncDto,
  TriggerInstitutionSyncDto,
} from '../dto/sync-query.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../utils';

@ApiTags('Synchronization & Integrations')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('candidates')
  @RequirePermission('system.admin', 'jupeb.registration.manage')
  @ApiOperation({
    summary: 'Trigger candidate synchronization to Attendance & CRMS',
    description: 'Enqueues background synchronization job for candidates in a session or given registration IDs.',
  })
  async triggerCandidateSync(
    @Body() dto: TriggerCandidateSyncDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.syncService.triggerCandidateSync(dto, userId);
  }

  @Post('subjects')
  @RequirePermission('system.admin', 'subjects.manage')
  @ApiOperation({
    summary: 'Trigger subjects synchronization to Attendance & CRMS',
    description: 'Enqueues background synchronization job for all or selected academic subjects.',
  })
  async triggerSubjectSync(
    @Body() dto: TriggerSubjectSyncDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.syncService.triggerSubjectSync(dto, userId);
  }

  @Post('institutions')
  @RequirePermission('system.admin', 'universities.manage')
  @ApiOperation({
    summary: 'Trigger institutions synchronization to Attendance & CRMS',
    description: 'Enqueues background synchronization job for all or selected member universities.',
  })
  async triggerInstitutionSync(
    @Body() dto: TriggerInstitutionSyncDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.syncService.triggerInstitutionSync(dto, userId);
  }

  @Get('logs')
  @RequirePermission('system.admin')
  @ApiOperation({
    summary: 'List synchronization logs and audit history',
    description: 'Retrieves paginated history of synchronization jobs with statuses, payloads, and failure traces.',
  })
  async listLogs(@Query() query: ListSyncLogsQueryDto) {
    return this.syncService.listLogs(query);
  }

  @Get('stats')
  @RequirePermission('system.admin')
  @ApiOperation({
    summary: 'Get synchronization statistics and health metrics',
    description: 'Returns totals and breakdown of completed, in-progress, and failed synchronization jobs.',
  })
  async getStats() {
    return this.syncService.getStats();
  }

  @Get('logs/:id')
  @RequirePermission('system.admin')
  @ApiOperation({
    summary: 'Get synchronization log details by ID',
  })
  async getLogById(@Param('id') id: string) {
    return this.syncService.getLogById(id);
  }

  @Post('logs/:id/retry')
  @RequirePermission('system.admin')
  @ApiOperation({
    summary: 'Retry a failed synchronization job',
    description: 'Re-enqueues the failed sync payload to BullMQ queue and updates retry counts.',
  })
  async retryFailedSync(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.syncService.retryFailedSync(id, userId);
  }
}
