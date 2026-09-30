import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDocumentRequirementDto {
  @ApiProperty({ example: 'birth_certificate', description: 'Unique requirement slug/key' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'Birth Certificate', description: 'Display title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'National population commission birth certificate or declaration of age' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  is_mandatory?: boolean;

  @ApiPropertyOptional({ example: ['application/pdf', 'image/jpeg', 'image/png'] })
  @IsArray()
  @IsOptional()
  allowed_mime_types?: string[];

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  max_file_size_mb?: number;

  @ApiPropertyOptional({ example: 'active', default: 'active' })
  @IsString()
  @IsOptional()
  status?: string;
}

export class PatchDocumentRequirementDto {
  @ApiPropertyOptional({ example: 'Birth Certificate' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_mandatory?: boolean;

  @ApiPropertyOptional({ example: ['application/pdf', 'image/jpeg'] })
  @IsArray()
  @IsOptional()
  allowed_mime_types?: string[];

  @ApiPropertyOptional({ example: 5 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  max_file_size_mb?: number;

  @ApiPropertyOptional({ example: 'active' })
  @IsString()
  @IsOptional()
  status?: string;
}

export class ListDocumentRequirementsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'active' })
  @IsString()
  @IsOptional()
  status?: string;
}

export class DocumentRequirementResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' })
  id: string;

  @ApiProperty({ example: 'birth_certificate' })
  key: string;

  @ApiProperty({ example: 'Birth Certificate' })
  title: string;

  @ApiPropertyOptional({ example: 'Valid national birth certificate' })
  description: string | null;

  @ApiProperty({ example: true })
  is_mandatory: boolean;

  @ApiProperty({ example: ['application/pdf', 'image/jpeg'] })
  allowed_mime_types: string[];

  @ApiProperty({ example: 10 })
  max_file_size_mb: number;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}
