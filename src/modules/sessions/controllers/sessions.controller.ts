import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { Response } from "express";
import { SessionsService } from "../services/sessions.service";
import { SessionContextService } from "../services/session-context.service";
import {
  CreateSessionDto,
  PatchSessionDto,
  ListSessionsQueryDto,
  SetRegistrationLockDto,
  SessionMetricsQueryDto,
  SetViewingSessionDto,
  SessionResponseDto,
  SessionContextResponseDto,
  SessionMetricsResponseDto,
  SessionStatsResponseDto,
  UniversityLockItemDto,
  SelectiveLockResultDto,
} from "../dto";
import {
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
} from "../../../utils";

@ApiTags("Academic Sessions")
@ApiBearerAuth("JWT")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class SessionsController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly sessionContextService: SessionContextService,
  ) {}

  @Get(["sessions/export", "catalog/sessions/export"])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Export all registration sessions to CSV",
    description:
      "Generates a CSV file of all academic sessions with deadlines and fee structures.",
  })
  async exportCsv(@Res() res: Response) {
    const csv = await this.sessionsService.exportCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="sessions.csv"');
    res.status(HttpStatus.OK).send(csv);
  }

  @Get(["sessions/context", "catalog/sessions/context"])
  @ApiOperation({
    summary: "Get active, viewing, and effective session context",
    description:
      "Resolves current academic session and cutoff states for the authenticated user and their institution.",
  })
  @ApiOkResponse({
    type: SessionContextResponseDto,
    description:
      "Active and effective session summaries with cutoff indicators.",
  })
  async getContext(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionContextService.getSessionContext(userId);
  }

  @Put(["sessions/viewing", "catalog/sessions/viewing"])
  @ApiOperation({
    summary: "Set viewing session preference",
    description:
      "Overrides default active session context for historical data inspection.",
  })
  @ApiOkResponse({
    type: SessionContextResponseDto,
  })
  async setViewing(@Req() req: any, @Body() dto: SetViewingSessionDto) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    await this.sessionContextService.setUserViewingSession(
      userId,
      dto.session_id,
    );
    return this.sessionContextService.getSessionContext(userId);
  }

  @Delete(["sessions/viewing", "catalog/sessions/viewing"])
  @ApiOperation({
    summary: "Reset viewing session preference",
    description:
      "Clears viewing session override to restore default active session context.",
  })
  @ApiOkResponse({
    type: SessionContextResponseDto,
  })
  async clearViewing(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    await this.sessionContextService.clearUserViewingSession(userId);
    return this.sessionContextService.getSessionContext(userId);
  }

  @Get(["sessions/metrics", "catalog/sessions/metrics"])
  @ApiOperation({
    summary: "Get registration metrics for effective session",
    description:
      "Aggregates counts: institutions, total candidates, enrolled candidates, and biometrics with growth trends.",
  })
  @ApiOkResponse({
    type: SessionMetricsResponseDto,
  })
  async metrics(@Req() req: any, @Query() query: SessionMetricsQueryDto) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.metrics(userId, query);
  }

  @Get(["sessions", "catalog/sessions"])
  @ApiOperation({
    summary: "List academic sessions with pagination",
    description:
      "Retrieves all academic registration sessions ordered chronologically.",
  })
  @ApiOkResponse({
    type: [SessionResponseDto],
  })
  async list(@Query() query: ListSessionsQueryDto) {
    return this.sessionsService.list(query);
  }

  @Post([
    "sessions/finalize-all-closed",
    "catalog/sessions/finalize-all-closed",
  ])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Bulk finalize candidate numbers across all closed sessions",
    description:
      "Generates exam candidate registration numbers for all unfinalized closed sessions.",
  })
  async finalizeAllClosed(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.finalizeAllClosed(userId);
  }

  @Get(["sessions/:sessionId/stats", "catalog/sessions/:sessionId/stats"])
  @ApiOperation({
    summary: "Get detailed registration breakdown for a session",
    description:
      "Returns registrations by status, centers count, subject combinations count, and biometrics coverage.",
  })
  @ApiOkResponse({
    type: SessionStatsResponseDto,
  })
  async stats(
    @Param("sessionId") sessionId: string,
    @Query() query: SessionMetricsQueryDto,
  ) {
    return this.sessionsService.stats(sessionId, query);
  }

  @Post(["sessions/:sessionId/open", "catalog/sessions/:sessionId/open"])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Open an academic registration session",
    description:
      "Transitions session status to open, closing any other active open sessions.",
  })
  @ApiOkResponse({
    type: SessionResponseDto,
  })
  async open(@Param("sessionId") sessionId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.open(sessionId, userId);
  }

  @Post(["sessions/:sessionId/close", "catalog/sessions/:sessionId/close"])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Close an open academic session",
    description:
      "Locks new registrations and transitions session status to closed.",
  })
  @ApiOkResponse({
    type: SessionResponseDto,
  })
  async close(@Param("sessionId") sessionId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.close(sessionId, userId);
  }

  @Post(["sessions/:sessionId/reopen", "catalog/sessions/:sessionId/reopen"])
  @RequirePermission("system.admin")
  @ApiOperation({
    summary: "Reopen a closed session (Super Admin only)",
    description:
      "Reactivates a closed academic session for registration modifications.",
  })
  @ApiOkResponse({
    type: SessionResponseDto,
  })
  async reopen(@Param("sessionId") sessionId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.reopen(sessionId, userId);
  }

  @Get([
    "sessions/:sessionId/university-locks",
    "sessions/:sessionId/registration-lock/universities",
  ])
  @ApiOperation({
    summary: "Get institution registration lock states for a session",
    description:
      "Paginated listing of institutions with their lock statuses and reason notes.",
  })
  @ApiOkResponse({
    type: [UniversityLockItemDto],
  })
  async getUniversityRegistrationLocks(
    @Param("sessionId") sessionId: string,
    @Query() query: any,
  ) {
    return this.sessionsService.getUniversityRegistrationLocks(
      sessionId,
      query,
    );
  }

  @Put(["sessions/:sessionId/university-locks"])
  @Patch([
    "sessions/:sessionId/university-locks",
    "sessions/:sessionId/registration-lock",
  ])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Lock or unlock registration for session or institutions",
    description:
      "Sets global registration lock or selective locks for specified institutions.",
  })
  @ApiOkResponse({
    type: SelectiveLockResultDto,
  })
  async setRegistrationLock(
    @Param("sessionId") sessionId: string,
    @Body() body: SetRegistrationLockDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.setRegistrationLock(sessionId, body, userId);
  }

  @Post(["sessions/:sessionId/finalize-candidate-numbers"])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Finalize candidate registration numbers for session",
    description: "Assigns official permanent exam candidate numbers.",
  })
  async finalize(@Param("sessionId") sessionId: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.finalizeCandidateNumbers(sessionId, userId);
  }

  @Post(["sessions", "catalog/sessions"])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Create a new academic registration session",
    description:
      "Creates and opens a new session, closing any previously open sessions.",
  })
  @ApiCreatedResponse({
    type: SessionResponseDto,
  })
  async create(@Body() dto: CreateSessionDto, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.create(dto, userId);
  }

  @Get(["sessions/:sessionId", "catalog/sessions/:sessionId"])
  @ApiOperation({
    summary: "Get academic session by ID",
    description: "Retrieves full details of a single registration session.",
  })
  @ApiOkResponse({
    type: SessionResponseDto,
  })
  async getById(@Param("sessionId") sessionId: string) {
    return this.sessionsService.getById(sessionId);
  }

  @Patch(["sessions/:sessionId", "catalog/sessions/:sessionId"])
  @RequirePermission("sessions.update")
  @ApiOperation({
    summary: "Update academic session details",
    description:
      "Updates session dates, cutoffs, deadlines, and fee configuration.",
  })
  @ApiOkResponse({
    type: SessionResponseDto,
  })
  async patch(
    @Param("sessionId") sessionId: string,
    @Body() dto: PatchSessionDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.sessionsService.patch(sessionId, dto, userId);
  }
}
