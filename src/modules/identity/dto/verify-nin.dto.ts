import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyNinDto {
  @ApiProperty({
    description: '11-digit Nigerian National Identification Number',
    example: '12345678901',
  })
  @IsString()
  @IsNotEmpty()
  nin: string;

  @ApiPropertyOptional({
    description: 'Unique client idempotency key to prevent duplicate provider billing',
    example: 'reg-intake-9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsOptional()
  @IsString()
  idempotency_key?: string;

  @ApiPropertyOptional({
    description: 'Supplemental intake fields (e.g. university_id, subject_combination_id)',
    example: { university_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' },
  })
  @IsOptional()
  @IsObject()
  intake_payload?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Academic session ID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'NIN provider name (defaults to speedysms, or mock for testing)',
    example: 'speedysms',
  })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({
    description: 'Force fresh lookup bypassing provider cache',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  force_fresh?: boolean;
}
