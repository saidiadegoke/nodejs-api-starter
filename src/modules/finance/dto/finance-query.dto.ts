import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListMyPaymentsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'successful' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  registration_id?: string;
}

export class ListAdminPaymentsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'successful' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({ example: 'TXN-123456' })
  @IsOptional()
  @IsString()
  q?: string;
}

export class ListInstitutionPaymentsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'successful' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({ example: '30d', enum: ['7d', '30d', '90d', 'all'] })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'affiliation_fee', description: 'Payment item code or UUID' })
  @IsOptional()
  @IsString()
  payment_item?: string;

  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260', description: 'Payment item UUID or code' })
  @IsOptional()
  @IsString()
  payment_item_id?: string;

  @ApiPropertyOptional({ example: 'unilag' })
  @IsOptional()
  @IsString()
  q?: string;
}
