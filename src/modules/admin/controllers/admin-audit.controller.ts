import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../utils';
import { AdminAuditService, AuditListFilters } from '../services/admin-audit.service';

// ── Query DTO (re-use inline — the filters are simple query strings) ────────

class AuditListQueryDto {
  admin_user_id?: string;
  actor_user_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  university_id?: string;
  jupeb_university_id?: string;
  start_date?: string;
  end_date?: string;
  q?: string;
  page?: number;
  limit?: number;
}

@ApiTags('Admin Audit Trail')
@Controller(['audit', 'admin/audit'])
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class AdminAuditController {
  constructor(private readonly auditService: AdminAuditService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export audit logs as CSV',
    description: 'Returns a downloadable CSV file of the audit trail (up to 1 000 rows).',
  })
  @ApiProduces('text/csv')
  async exportCsv(@Query() query: AuditListQueryDto, @Req() req: any, @Res() res: Response) {
    const csv = await this.auditService.exportCsv(
      query as AuditListFilters,
      req.user?.user_id,
    );
    const filename = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(csv);
  }

  @Get()
  @ApiOperation({
    summary: 'List audit logs',
    description:
      'Paginated audit trail with RBAC scoping, search, and filters (action, resource, date range, university).',
  })
  @ApiOkResponse({ description: 'Paginated audit logs.' })
  async list(@Query() query: AuditListQueryDto, @Req() req: any) {
    const result = await this.auditService.list(
      query as AuditListFilters,
      req.user?.user_id,
    );
    const totalPages = Math.ceil(result.total / (result.limit || 20));
    return {
      success: true,
      message: 'Audit logs retrieved successfully',
      data: result.logs,
      logs: result.logs,
      total: result.total,
      page: result.page,
      limit: result.limit,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages,
        total_pages: totalPages,
      },
    };
  }
}
