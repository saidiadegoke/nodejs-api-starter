import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsEmail,
  IsInt,
  Min,
  IsObject,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum UniversityTypeEnum {
  FEDERAL = 'federal',
  STATE = 'state',
  PRIVATE = 'private',
}

export enum UniversityStatusEnum {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export class CreateUniversityDto {
  @ApiProperty({ example: '001', description: 'Unique 3-digit university code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'University of Lagos', description: 'Full university name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'UNILAG', description: 'Short university name' })
  @IsString()
  @IsOptional()
  short_name?: string;

  @ApiProperty({ example: 'UNILAG', description: 'JUPEB university prefix / acronym' })
  @IsString()
  @IsNotEmpty()
  jupeb_prefix: string;

  @ApiPropertyOptional({
    enum: UniversityTypeEnum,
    example: UniversityTypeEnum.FEDERAL,
    description: 'Category / ownership type of the institution',
  })
  @IsEnum(UniversityTypeEnum)
  @IsOptional()
  university_type?: UniversityTypeEnum;

  @ApiProperty({ example: 'admin@unilag.edu.ng', description: 'Contact & institution admin email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: 'Akoka, Yaba, Lagos', description: 'Physical address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Contact phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 500, description: 'Expected candidate capacity' })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  expected_candidate_count?: number;

  @ApiPropertyOptional({ example: 'Premier federal university in Lagos', description: 'Description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: { state: 'Lagos' }, description: 'Additional metadata' })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ example: 'John', description: 'Institution admin first name' })
  @IsString()
  @IsOptional()
  admin_first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Institution admin last name' })
  @IsString()
  @IsOptional()
  admin_last_name?: string;
}

export class PatchUniversityDto {
  @ApiPropertyOptional({ example: '001', description: 'Unique 3-digit university code' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'University of Lagos' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'UNILAG' })
  @IsString()
  @IsOptional()
  short_name?: string;

  @ApiPropertyOptional({ example: 'UNILAG', description: 'JUPEB university prefix / acronym' })
  @IsString()
  @IsOptional()
  jupeb_prefix?: string;

  @ApiPropertyOptional({ enum: UniversityTypeEnum, example: UniversityTypeEnum.FEDERAL })
  @IsEnum(UniversityTypeEnum)
  @IsOptional()
  university_type?: UniversityTypeEnum;

  @ApiPropertyOptional({ example: 'admin@unilag.edu.ng' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Akoka, Yaba, Lagos' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 600 })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  expected_candidate_count?: number;

  @ApiPropertyOptional({ example: 'Updated notes' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: { state: 'Lagos' } })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ enum: UniversityStatusEnum, example: UniversityStatusEnum.ACTIVE })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  is_active?: boolean;
}

export class ListUniversitiesQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ enum: UniversityStatusEnum, example: UniversityStatusEnum.ACTIVE })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'Lagos', description: 'Search term by code, name, short name, or prefix' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', description: 'Session UUID for enrollment counts' })
  @IsUUID()
  @IsOptional()
  session_id?: string;
}

export class ResendCredentialsDto {
  @ApiProperty({ example: 'admin@unilag.edu.ng', description: 'Institution admin email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
