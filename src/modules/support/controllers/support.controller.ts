import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SupportService } from '../services/support.service';
import {
  CreateSupportTicketDto,
  AddTicketMessageDto,
  UpdateTicketStatusDto,
  AdminUpdateTicketDto,
  ListTicketsQueryDto,
  SupportTicketResponseDto,
  SupportTicketListResponseDto,
  SupportStatsResponseDto,
  SupportCategoryItemDto,
  SupportMessageResponseDto,
} from '../dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../utils';

function getUserId(req: any): string {
  return req?.user?.id || req?.user?.user_id || req?.user?.userId || '';
}

@ApiTags('Support & Help Desk')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('categories')
  @ApiOperation({
    summary: 'List predefined support categories for app intake dropdowns',
    description: 'Public endpoint listing active support ticket categories.',
  })
  @ApiOkResponse({ type: [SupportCategoryItemDto] })
  getCategories() {
    return this.supportService.getCategories();
  }

  // ==========================================
  // Student Ticket Operations
  // ==========================================

  @Post('tickets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Submit a new support ticket (Student / Candidate)',
    description: 'Creates ticket and automatically binds candidate active registration and institution context.',
  })
  @ApiCreatedResponse({ type: SupportTicketResponseDto })
  async createStudentTicket(@Body() dto: CreateSupportTicketDto, @Req() req: any) {
    return this.supportService.createStudentTicket(getUserId(req), dto);
  }

  @Get('my-tickets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List support tickets created by authenticated student',
    description: 'Paginated list of support tickets with status and category filtering.',
  })
  @ApiOkResponse({ type: SupportTicketListResponseDto })
  async getMyTickets(@Query() query: ListTicketsQueryDto, @Req() req: any) {
    return this.supportService.getMyTickets(getUserId(req), query);
  }

  @Get('tickets/:ticketId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get ticket details and conversation thread (Student)',
    description: 'Retrieves full ticket detail with all replied messages.',
  })
  @ApiOkResponse({ type: SupportTicketResponseDto })
  async getMyTicketDetail(@Param('ticketId') ticketId: string, @Req() req: any) {
    return this.supportService.getMyTicketDetail(getUserId(req), ticketId);
  }

  @Post('tickets/:ticketId/messages')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Reply to support ticket thread (Student)',
    description: 'Appends a response message to the ticket conversation.',
  })
  @ApiCreatedResponse({ type: SupportMessageResponseDto })
  async addStudentReply(
    @Param('ticketId') ticketId: string,
    @Body() dto: AddTicketMessageDto,
    @Req() req: any,
  ) {
    return this.supportService.addStudentReply(getUserId(req), ticketId, dto);
  }

  // ==========================================
  // Institution Staff Operations
  // ==========================================

  @Get('institution/tickets')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.view', 'support.manage', 'candidate.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List support tickets for institution candidates',
    description: 'Scoped to the institution university ID of the authenticated staff member.',
  })
  @ApiOkResponse({ type: SupportTicketListResponseDto })
  async institutionListTickets(@Query() query: ListTicketsQueryDto, @Req() req: any) {
    return this.supportService.institutionListTickets(getUserId(req), query);
  }

  @Get('institution/stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.view', 'support.manage', 'candidate.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Support ticket counts for institution dashboard',
    description: 'Summary counters by status (open, in_progress, resolved, closed).',
  })
  @ApiOkResponse({ type: SupportStatsResponseDto })
  async institutionStats(@Req() req: any) {
    return this.supportService.institutionStats(getUserId(req));
  }

  @Get('institution/tickets/:ticketId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.view', 'support.manage', 'candidate.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get ticket details and thread for institution staff',
    description: 'Returns ticket details with access verification against university tenancy.',
  })
  @ApiOkResponse({ type: SupportTicketResponseDto })
  async institutionGetTicket(@Param('ticketId') ticketId: string, @Req() req: any) {
    return this.supportService.institutionGetTicket(getUserId(req), ticketId);
  }

  @Post('institution/tickets/:ticketId/reply')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.manage', 'candidate.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Institution staff reply to student support ticket',
    description: 'Sends message as institution_staff and transitions ticket to in_progress if open.',
  })
  @ApiCreatedResponse({ type: SupportMessageResponseDto })
  async institutionReply(
    @Param('ticketId') ticketId: string,
    @Body() dto: AddTicketMessageDto,
    @Req() req: any,
  ) {
    return this.supportService.institutionReply(getUserId(req), ticketId, dto);
  }

  @Patch('institution/tickets/:ticketId/status')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.manage', 'candidate.view')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update ticket resolution status (Institution Staff)',
    description: 'Updates status to in_progress, resolved, or closed with optional resolution comments.',
  })
  @ApiOkResponse({ type: SupportTicketResponseDto })
  async institutionUpdateStatus(
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
    @Req() req: any,
  ) {
    return this.supportService.institutionUpdateStatus(getUserId(req), ticketId, dto);
  }

  // ==========================================
  // Central Admin Operations (Global)
  // ==========================================

  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.view', 'support.manage', 'system.admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List all support tickets across all institutions (Global Admin)',
    description: 'Global administrator view of all support inquiries.',
  })
  @ApiOkResponse({ type: SupportTicketListResponseDto })
  async adminListTickets(@Query() query: ListTicketsQueryDto) {
    return this.supportService.adminListTickets(query);
  }

  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.view', 'support.manage', 'system.admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Global support ticket metrics',
    description: 'Counts across all tickets across the entire platform.',
  })
  @ApiOkResponse({ type: SupportStatsResponseDto })
  async adminStats() {
    return this.supportService.adminStats();
  }

  @Get('admin/tickets/:ticketId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.view', 'support.manage', 'system.admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Get any support ticket details (Admin)',
    description: 'Full ticket detail and message thread.',
  })
  @ApiOkResponse({ type: SupportTicketResponseDto })
  async adminGetTicket(@Param('ticketId') ticketId: string) {
    return this.supportService.adminGetTicket(ticketId);
  }

  @Post('admin/tickets/:ticketId/reply')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.manage', 'system.admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Admin reply to support ticket',
    description: 'Appends administrator response to ticket thread.',
  })
  @ApiCreatedResponse({ type: SupportMessageResponseDto })
  async adminReply(
    @Param('ticketId') ticketId: string,
    @Body() dto: AddTicketMessageDto,
    @Req() req: any,
  ) {
    return this.supportService.adminReply(getUserId(req), ticketId, dto);
  }

  @Patch('admin/tickets/:ticketId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('support.manage', 'system.admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update ticket details / assignment / priority (Admin)',
    description: 'Modifies status, priority, category, or assigned agent.',
  })
  @ApiOkResponse({ type: SupportTicketResponseDto })
  async adminUpdateTicket(
    @Param('ticketId') ticketId: string,
    @Body() dto: AdminUpdateTicketDto,
  ) {
    return this.supportService.adminUpdateTicket(ticketId, dto);
  }
}
