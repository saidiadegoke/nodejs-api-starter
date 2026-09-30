import {
  IsBoolean,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetRegistrationLockDto {
  @ApiProperty({
    description: 'Lock status (true to lock, false to unlock)',
    example: true,
  })
  @IsBoolean()
  locked: boolean;

  @ApiPropertyOptional({
    description: 'Array of university IDs for selective locking',
    example: ['d3b07384-d113-40f4-8a4e-379e4971c260'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  university_ids?: string[];

  @ApiPropertyOptional({
    description: 'Single university ID for selective locking',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({
    description: 'Reason for the lock action',
    example: 'Pending affiliation fee payment for the current session',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
