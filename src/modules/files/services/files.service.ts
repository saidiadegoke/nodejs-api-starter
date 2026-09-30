import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { PutObjectCommand, DeleteObjectCommand, ObjectCannedACL } from '@aws-sdk/client-s3';
import { LoggerFactory } from '../../../logger';
import { FileRepository } from '../repositories/file.repository';
import {
  UploadBase64Dto,
  BatchCreateFileDto,
  ListUserFilesQueryDto,
  FileResponseDto,
  FileListResponseDto,
  BatchUploadResponseDto,
} from '../dto';

// Dynamic import for S3 configuration
let s3Client: any;
let s3BucketName: string = 'app-files';
let buildPublicObjectUrl: (key: string) => string = (k) => `https://storage.example.com/${k}`;

try {
  const s3 = require('../../../utils/config/s3.config');
  s3Client = s3.s3Client;
  s3BucketName = s3.s3BucketName || 'app-files';
  buildPublicObjectUrl = s3.buildPublicObjectUrl;
} catch {
  // S3 fallback
}

@Injectable()
export class FilesService {
  private readonly logger;

  constructor(
    private readonly fileRepo: FileRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(FilesService.name);
  }

  private mapToFileResponse(entity: any): FileResponseDto {
    return {
      id: entity.id,
      provider: entity.provider || 's3',
      provider_path: entity.providerPath || entity.provider_path,
      file_url: entity.fileUrl || entity.file_url,
      file_type: entity.fileType || entity.file_type,
      file_size: Number(entity.fileSize || entity.file_size) || 0,
      uploaded_by: entity.uploadedBy || entity.uploaded_by,
      context: entity.context || 'general',
      metadata: entity.metadata || {},
      is_public: Boolean(entity.isPublic ?? entity.is_public),
      created_at: entity.createdAt || entity.created_at,
      updated_at: entity.updatedAt || entity.updated_at,
    };
  }

  async uploadFile(file: any, uploadedBy: string, context = 'general'): Promise<FileResponseDto> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided for upload');
    }

    const fileId = uuidv4();
    const fileExtension = path.extname(file.originalname || '');
    const fileName = `${fileId}${fileExtension}`;
    const s3Key =
      context === 'user_assets'
        ? `${context}/${uploadedBy}/${fileName}`
        : `${context}/${fileName}`;

    let fileUrl = '';
    let provider = 's3';

    try {
      if (s3Client) {
        const uploadParams = {
          Bucket: s3BucketName,
          Key: s3Key,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/octet-stream',
          ACL: ObjectCannedACL.public_read,
        };
        await s3Client.send(new PutObjectCommand(uploadParams));
        fileUrl = buildPublicObjectUrl(s3Key);
      } else {
        fileUrl = `https://storage.local/${s3Key}`;
        provider = 'local';
      }
    } catch (err: any) {
      this.logger.error(`S3 upload error: ${err.message}`);
      throw new BadRequestException(`Failed to upload file to storage: ${err.message}`);
    }

    const saved = await this.fileRepo.create({
      provider,
      providerPath: s3Key,
      fileUrl,
      fileType: file.mimetype || 'application/octet-stream',
      fileSize: file.size || file.buffer.length,
      uploadedBy,
      context,
      metadata: {
        original_name: file.originalname,
        uploaded_at: new Date().toISOString(),
        s3_bucket: s3BucketName,
        s3_key: s3Key,
      },
      isPublic: true,
    });

    return this.mapToFileResponse(saved);
  }

  async uploadFromBase64(dto: UploadBase64Dto, uploadedBy: string): Promise<FileResponseDto> {
    const fileId = uuidv4();
    const context = dto.context || 'general';
    const fileName = dto.file_name || 'file';

    const matches = dto.file_data.match(/^data:(.+);base64,/);
    const mimeType = matches ? matches[1] : 'application/octet-stream';
    const base64Length = dto.file_data.replace(/^data:.+;base64,/, '').length;
    const fileSize = Math.floor((base64Length * 3) / 4);

    const s3Key = `${context}/${fileId}`;
    const fileUrl = `${process.env.API_BASE_URL || 'http://localhost:5000'}/uploads/${context}/${fileId}`;

    const saved = await this.fileRepo.create({
      provider: process.env.DEFAULT_FILE_PROVIDER || 'mock',
      providerPath: `/uploads/${context}/${fileId}`,
      fileUrl,
      fileType: mimeType,
      fileSize,
      uploadedBy,
      context,
      metadata: {
        original_name: fileName,
        uploaded_at: new Date().toISOString(),
        upload_method: 'base64',
      },
      isPublic: context === 'profile_photo',
    });

    return this.mapToFileResponse(saved);
  }

  async uploadBatch(files: any[], uploadedBy: string, context = 'general'): Promise<BatchUploadResponseDto> {
    if (!files || !files.length) {
      throw new BadRequestException('No files provided for batch upload');
    }

    const results: FileResponseDto[] = [];
    for (const f of files) {
      const res = await this.uploadFile(f, uploadedBy, context);
      results.push(res);
    }

    return {
      files: results,
      count: results.length,
    };
  }

  async createFromMetadata(dto: BatchCreateFileDto, uploadedBy: string): Promise<BatchUploadResponseDto> {
    const results: FileResponseDto[] = [];
    for (const f of dto.files) {
      const saved = await this.fileRepo.create({
        provider: f.provider,
        providerPath: f.provider_path,
        fileUrl: f.file_url,
        fileType: f.file_type,
        fileSize: f.file_size,
        uploadedBy,
        context: f.context || 'general',
        metadata: f.metadata || {},
        isPublic: true,
      });
      results.push(this.mapToFileResponse(saved));
    }

    return {
      files: results,
      count: results.length,
    };
  }

  async getFile(fileId: string, _userId: string): Promise<FileResponseDto> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }
    return this.mapToFileResponse(file);
  }

  async getUserFiles(userId: string, query: ListUserFilesQueryDto): Promise<FileListResponseDto> {
    const result = await this.fileRepo.findUserFiles(userId, query);
    return {
      files: result.files.map((f) => this.mapToFileResponse(f)),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  }

  async deleteFile(fileId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const file = await this.fileRepo.findById(fileId);
    if (!file) {
      throw new NotFoundException('File not found');
    }

    if (file.provider === 's3' && s3Client && file.providerPath) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: s3BucketName,
            Key: file.providerPath,
          }),
        );
      } catch (err: any) {
        this.logger.warn(`Could not delete S3 object: ${err.message}`);
      }
    }

    await this.fileRepo.softDelete(fileId, userId);
    return {
      success: true,
      message: 'File deleted successfully',
    };
  }
}
