import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateOcrJobDto {
  @ApiPropertyOptional({ description: 'Existing uploaded file ID (UUID)' })
  @IsOptional()
  @IsString()
  file_id?: string;

  @ApiPropertyOptional({ description: 'Exam type', default: 'auto' })
  @IsOptional()
  @IsString()
  exam_type?: string = 'auto';

  @ApiPropertyOptional({ description: 'Synchronously wait for job completion', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  wait?: boolean = false;

  @ApiPropertyOptional({ description: 'Optional context label' })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({ description: 'JSON metadata object or string' })
  @IsOptional()
  metadata?: any;

  @ApiPropertyOptional({ description: 'Base64 data string (when not sending multipart file)' })
  @IsOptional()
  @IsString()
  data?: string;

  @ApiPropertyOptional({ description: 'Original filename for base64 data' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: 'Mime type for base64 data' })
  @IsOptional()
  @IsString()
  mime_type?: string;
}

export class ListOcrJobsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by job status' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by exam type' })
  @IsOptional()
  @IsString()
  exam_type?: string;

  @ApiPropertyOptional({ description: 'Filter by file ID' })
  @IsOptional()
  @IsString()
  file_id?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Page limit', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 50;
}

export class BindRequirementDto {
  @ApiProperty({ description: 'Registration ID (UUID)' })
  @IsNotEmpty()
  @IsString()
  registration_id: string;

  @ApiProperty({ description: 'Document requirement ID (UUID)' })
  @IsNotEmpty()
  @IsString()
  requirement_id: string;
}

export class SubjectGradeItemDto {
  @ApiProperty({ description: 'Subject name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Subject grade (e.g. A1, B2, C6)' })
  @IsNotEmpty()
  @IsString()
  grade: string;

  @ApiPropertyOptional({ description: 'Optional numeric score' })
  @IsOptional()
  @IsNumber()
  score?: number;
}

export class CreateManualEntryDto {
  @ApiProperty({ description: 'Exam type (waec, neco, nabteb, gce, generic)' })
  @IsNotEmpty()
  @IsString()
  exam_type: string;

  @ApiProperty({ description: 'Array of subjects with grades', type: [SubjectGradeItemDto] })
  @IsArray()
  subjects: SubjectGradeItemDto[];

  @ApiPropertyOptional({ description: 'Metadata payload (registration_id, sitting, etc.)' })
  @IsOptional()
  metadata?: any;

  @ApiPropertyOptional({ description: 'Optional context string' })
  @IsOptional()
  @IsString()
  context?: string;
}

export class GetSubjectsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by exam board (waec, neco, nabteb, gce)' })
  @IsOptional()
  @IsString()
  board?: string;
}
