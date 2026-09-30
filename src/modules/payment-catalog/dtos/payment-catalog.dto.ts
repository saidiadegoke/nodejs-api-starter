import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentFeeSourceEnum {
  AFFILIATION = 'affiliation',
  EXAMINATION = 'examination',
  FIXED = 'fixed',
}

export class CreatePaymentItemDto {
  @ApiProperty({ example: 'affiliation_fee', description: 'Unique payment item code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Affiliation Fee', description: 'Display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Annual institution affiliation fee' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    enum: PaymentFeeSourceEnum,
    example: PaymentFeeSourceEnum.AFFILIATION,
    default: PaymentFeeSourceEnum.FIXED,
  })
  @IsEnum(PaymentFeeSourceEnum)
  @IsOptional()
  fee_source?: PaymentFeeSourceEnum;

  @ApiPropertyOptional({ example: 25000.0, description: 'Fixed amount if fee_source=fixed' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  fixed_amount?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sort_order?: number;
}

export class PatchPaymentItemDto {
  @ApiPropertyOptional({ example: 'Affiliation Fee' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: PaymentFeeSourceEnum, example: PaymentFeeSourceEnum.FIXED })
  @IsEnum(PaymentFeeSourceEnum)
  @IsOptional()
  fee_source?: PaymentFeeSourceEnum;

  @ApiPropertyOptional({ example: 30000.0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  fixed_amount?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sort_order?: number;
}

export class CreatePaymentStructureDto {
  @ApiProperty({ example: 'full', description: 'Unique payment structure code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Full Payment', description: 'Display name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Pay complete balance in a single transaction' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  allows_partial?: boolean;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 1, default: 0 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sort_order?: number;
}

export class PatchPaymentStructureDto {
  @ApiPropertyOptional({ example: 'Partial Payment' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  allows_partial?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ example: 2 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  sort_order?: number;
}

export class ListPaymentCatalogQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'fee' })
  @IsString()
  @IsOptional()
  q?: string;
}

export class PaymentItemResponseDto {
  @ApiProperty({ example: 'e7138404-e35c-4d52-bda3-6c70281229a1' })
  id: string;

  @ApiProperty({ example: 'affiliation_fee' })
  code: string;

  @ApiProperty({ example: 'Affiliation Fee' })
  name: string;

  @ApiPropertyOptional({ example: 'Institution affiliation fee for the session' })
  description: string | null;

  @ApiProperty({ example: 'affiliation' })
  fee_source: string;

  @ApiPropertyOptional({ example: null })
  fixed_amount: number | null;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ example: 1 })
  sort_order: number;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}

export class PaymentStructureResponseDto {
  @ApiProperty({ example: '269df16a-36ee-4613-bc70-cb64c8c7f999' })
  id: string;

  @ApiProperty({ example: 'full' })
  code: string;

  @ApiProperty({ example: 'Full Payment' })
  name: string;

  @ApiPropertyOptional({ example: 'Clear the full outstanding amount at once' })
  description: string | null;

  @ApiProperty({ example: false })
  allows_partial: boolean;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiProperty({ example: 1 })
  sort_order: number;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}
