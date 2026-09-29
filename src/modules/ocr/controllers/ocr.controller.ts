import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { OcrService } from '../services/ocr.service';
import {
  CreateOcrJobDto,
  ListOcrJobsQueryDto,
  BindRequirementDto,
  CreateManualEntryDto,
  GetSubjectsQueryDto,
} from '../dto';
import { JwtAuthGuard, Public } from '../../../utils';

function serializeJob(job: any, result: any, viewerIsStaff: boolean) {
  if (!job) return null;
  const out: any = {
    job_id: job.id,
    file_id: job.file_id,
    exam_type: job.exam_type,
    provider: job.provider,
    status: job.status,
    attempt_count: job.attempt_count,
    started_at: job.started_at,
    completed_at: job.completed_at,
    requested_by: job.requested_by,
    context: job.context,
    metadata: job.metadata || {},
    created_at: job.created_at,
    updated_at: job.updated_at,
    error: job.error_code
      ? { code: job.error_code, message: job.error_message }
      : null,
    result: null,
    raw_text_excerpt: null,
    confidence: null,
    exam_type_detected: null,
  };

  if (result) {
    out.result = result.result_json;
    out.confidence = Number(result.confidence);
    out.exam_type_detected = result.exam_type_detected;
    out.raw_text_excerpt = (result.raw_text || '').slice(0, 500);
    if (viewerIsStaff) {
      out.raw_text = result.raw_text;
      out.provider_payload = result.provider_payload;
    }
  }
  return out;
}

@ApiTags('OCR Processing')
@Controller('ocr')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'OCR module health check' })
  getHealth() {
    return { success: true, module: 'ocr', status: 'ok' };
  }

  @Post('jobs')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({ summary: 'Create and enqueue OCR extraction job' })
  async createJob(
    @UploadedFile() file: any,
    @Body() body: CreateOcrJobDto,
    @Req() req: any,
  ) {
    const userId = req.user?.user_id;
    let metadata = body.metadata || {};
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }

    let base64Payload = null;
    if (body.data && body.filename) {
      base64Payload = {
        data: body.data,
        filename: body.filename,
        mime_type: body.mime_type,
      };
    }

    const { job, completedJob } = await this.ocrService.createJob({
      userId,
      fileId: body.file_id || null,
      multerFile: file || null,
      base64: base64Payload,
      examType: body.exam_type || 'auto',
      wait: Boolean(body.wait),
      context: body.context || null,
      metadata,
    });

    const finalJob = completedJob || job;
    const resultObj =
      finalJob.status === 'completed'
        ? (await this.ocrService.getJob(finalJob.id, userId)).result
        : null;

    return serializeJob(finalJob, resultObj, false);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List OCR jobs for current user or all jobs (staff)' })
  async listJobs(@Query() query: ListOcrJobsQueryDto, @Req() req: any) {
    const userId = req.user?.user_id;
    const { rows, total, page, limit, viewerIsStaff } = await this.ocrService.listJobs({
      viewerId: userId,
      status: query.status,
      examType: query.exam_type,
      fileId: query.file_id,
      page: query.page,
      limit: query.limit,
    });

    const completedIds = rows.filter((r) => r.status === 'completed').map((r) => r.id);
    const resultsByJob: Record<string, any> = {};
    if (completedIds.length) {
      await Promise.all(
        completedIds.map(async (id) => {
          const { result } = await this.ocrService.getJob(id, userId);
          resultsByJob[id] = result;
        }),
      );
    }

    const data = rows.map((r) => serializeJob(r, resultsByJob[r.id] || null, viewerIsStaff));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / (limit || 50)),
      },
    };
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get details and extraction result of an OCR job' })
  async getJob(@Param('jobId') jobId: string, @Req() req: any) {
    const { job, result, viewerIsStaff } = await this.ocrService.getJob(
      jobId,
      req.user?.user_id,
    );
    return serializeJob(job, result, viewerIsStaff);
  }

  @Post('jobs/:jobId/retry')
  @ApiOperation({ summary: 'Retry a failed OCR job' })
  async retryJob(@Param('jobId') jobId: string, @Req() req: any) {
    const newJob = await this.ocrService.retryJob(jobId, req.user?.user_id);
    return serializeJob(newJob, null, false);
  }

  @Post('jobs/:jobId/bind-requirement')
  @ApiOperation({ summary: 'Bind completed OCR job to candidate registration requirement' })
  async bindRequirement(
    @Param('jobId') jobId: string,
    @Body() body: BindRequirementDto,
    @Req() req: any,
  ) {
    const updated = await this.ocrService.bindRequirement({
      jobId,
      viewerId: req.user?.user_id,
      registrationId: body.registration_id,
      requirementId: body.requirement_id,
    });
    return serializeJob(updated, null, false);
  }

  @Get('files/:fileId/latest')
  @ApiOperation({ summary: 'Get latest completed OCR job for a file' })
  async getLatestForFile(@Param('fileId') fileId: string, @Req() req: any) {
    const { job, result, viewerIsStaff } = await this.ocrService.getLatestForFile({
      fileId,
      viewerId: req.user?.user_id,
    });
    return serializeJob(job, result, viewerIsStaff);
  }

  @Post('manual-entry')
  @ApiOperation({ summary: 'Manual entry of subject grades without uploading document' })
  async createManualEntry(@Body() body: CreateManualEntryDto, @Req() req: any) {
    const { job, result } = await this.ocrService.createManualEntry({
      userId: req.user?.user_id,
      examType: body.exam_type,
      subjects: body.subjects,
      metadata: body.metadata || {},
      context: body.context || null,
    });

    return serializeJob(job, result, false);
  }

  @Get('subjects')
  @Public()
  @ApiOperation({ summary: 'Static reference list of O-level subjects' })
  getSubjects(@Query() query: GetSubjectsQueryDto) {
    return this.ocrService.getSubjects(query.board);
  }
}
