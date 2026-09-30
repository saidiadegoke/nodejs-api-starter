import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FilesService } from '../services/files.service';
import {
  UploadBase64Dto,
  BatchCreateFileDto,
  ListUserFilesQueryDto,
  FileResponseDto,
  FileListResponseDto,
  BatchUploadResponseDto,
  DeleteFileResponseDto,
} from '../dto';
import { JwtAuthGuard } from '../../../utils';

@ApiTags('File & Asset Storage')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        context: { type: 'string', example: 'general' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload single file to object storage',
    description: 'Uploads binary file to S3/Spaces and registers record in database.',
  })
  @ApiCreatedResponse({ type: FileResponseDto })
  async uploadFile(
    @UploadedFile() file: any,
    @Body('context') context: string,
    @Req() req: any,
  ) {
    return this.filesService.uploadFile(file, req.user?.user_id, context || 'general');
  }

  @Post('upload-base64')
  @ApiOperation({
    summary: 'Upload file encoded as Base64 string',
    description: 'Decodes Base64 data URI and saves file to object storage.',
  })
  @ApiCreatedResponse({ type: FileResponseDto })
  async uploadBase64(@Body() dto: UploadBase64Dto, @Req() req: any) {
    return this.filesService.uploadFromBase64(dto, req.user?.user_id);
  }

  @Post('upload-batch')
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        context: { type: 'string', example: 'general' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload multiple files (up to 10)',
    description: 'Uploads up to 10 files in parallel and returns array of file records.',
  })
  @ApiCreatedResponse({ type: BatchUploadResponseDto })
  async uploadBatch(
    @UploadedFiles() files: any[],
    @Body('context') context: string,
    @Req() req: any,
  ) {
    return this.filesService.uploadBatch(files, req.user?.user_id, context || 'general');
  }

  @Post('batch')
  @ApiOperation({
    summary: 'Create file records from pre-existing metadata',
    description: 'Registers files uploaded directly or through client-side S3 presigned URLs.',
  })
  @ApiCreatedResponse({ type: BatchUploadResponseDto })
  async createFromMetadata(@Body() dto: BatchCreateFileDto, @Req() req: any) {
    return this.filesService.createFromMetadata(dto, req.user?.user_id);
  }

  @Post('upload-profile-photo')
  @UseInterceptors(FileInterceptor('profile_photo'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        profile_photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Convenience endpoint to upload user profile photo',
    description: 'Uploads image under profile_photo context and updates avatar URL.',
  })
  @ApiCreatedResponse({ type: FileResponseDto })
  async uploadProfilePhoto(@UploadedFile() file: any, @Req() req: any) {
    return this.filesService.uploadFile(file, req.user?.user_id, 'profile_photo');
  }

  @Get('user-files')
  @ApiOperation({
    summary: 'Get uploaded files list for current user',
    description: 'Paginated list of files uploaded by authenticated user with context and type filters.',
  })
  @ApiOkResponse({ type: FileListResponseDto })
  async getUserFiles(@Query() query: ListUserFilesQueryDto, @Req() req: any) {
    return this.filesService.getUserFiles(req.user?.user_id, query);
  }

  @Get(':file_id')
  @ApiOperation({
    summary: 'Get single file record by ID',
    description: 'Retrieves file URL, size, mimetype, and metadata.',
  })
  @ApiOkResponse({ type: FileResponseDto })
  async getFile(@Param('file_id') fileId: string, @Req() req: any) {
    return this.filesService.getFile(fileId, req.user?.user_id);
  }

  @Delete(':file_id')
  @ApiOperation({
    summary: 'Soft-delete file record and remove from storage',
    description: 'Deletes file from S3 bucket and soft-deletes database record.',
  })
  @ApiOkResponse({ type: DeleteFileResponseDto })
  async deleteFile(@Param('file_id') fileId: string, @Req() req: any) {
    return this.filesService.deleteFile(fileId, req.user?.user_id);
  }
}
