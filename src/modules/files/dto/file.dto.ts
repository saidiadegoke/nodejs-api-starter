import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsNotEmpty, IsInt, Min, Max, IsArray, ValidateNested } from 'class-validator';

export class UploadBase64Dto {
  @ApiProperty({
    description: 'Base64 data URI of the file',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  })
  @IsNotEmpty()
  @IsString()
  file_data: string;

  @ApiPropertyOptional({ example: 'profile_photo', default: 'general' })
  @IsOptional()
  @IsString()
  context?: string = 'general';

  @ApiPropertyOptional({ example: 'avatar.png' })
  @IsOptional()
  @IsString()
  file_name?: string;
}

export class CreateFileMetadataItemDto {
  @ApiProperty({ example: 's3' })
  @IsString()
  provider: string;

  @ApiProperty({ example: 'user_assets/photo.jpg' })
  @IsString()
  provider_path: string;

  @ApiProperty({ example: 'https://cdn.example.com/user_assets/photo.jpg' })
  @IsString()
  file_url: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  file_type: string;

  @ApiProperty({ example: 102400 })
  file_size: number;

  @ApiPropertyOptional({ example: 'user_assets' })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class BatchCreateFileDto {
  @ApiProperty({ type: [CreateFileMetadataItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFileMetadataItemDto)
  files: CreateFileMetadataItemDto[];
}

export class ListUserFilesQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'profile_photo' })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsOptional()
  @IsString()
  file_type?: string;

  @ApiPropertyOptional({ example: 'photo' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class FileResponseDto {
  @ApiProperty({ example: 'f0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string;

  @ApiProperty({ example: 's3' })
  provider: string;

  @ApiProperty({ example: 'profile_photo/123.jpg' })
  provider_path: string;

  @ApiProperty({ example: 'https://cdn.example.com/profile_photo/123.jpg' })
  file_url: string;

  @ApiProperty({ example: 'image/jpeg' })
  file_type: string;

  @ApiProperty({ example: 204800 })
  file_size: number;

  @ApiProperty({ example: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  uploaded_by: string;

  @ApiProperty({ example: 'profile_photo' })
  context: string;

  @ApiPropertyOptional({ example: { original_name: 'photo.jpg' } })
  metadata?: Record<string, any> | null;

  @ApiProperty({ example: true })
  is_public: boolean;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  updated_at: Date;
}

export class FilePaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 15 })
  total: number;
}

export class FileListResponseDto {
  @ApiProperty({ type: [FileResponseDto] })
  files: FileResponseDto[];

  @ApiProperty({ type: FilePaginationMetaDto })
  pagination: FilePaginationMetaDto;
}

export class BatchUploadResponseDto {
  @ApiProperty({ type: [FileResponseDto] })
  files: FileResponseDto[];

  @ApiProperty({ example: 3 })
  count: number;
}

export class DeleteFileResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'File deleted successfully' })
  message: string;
}
