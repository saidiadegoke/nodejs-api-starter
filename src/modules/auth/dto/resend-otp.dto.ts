import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiPropertyOptional({ example: 'student@example.com', description: 'User email or phone identifier' })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Legacy phone field' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'email', enum: ['email', 'sms', 'both'], description: 'Delivery channel' })
  @IsOptional()
  @IsString()
  channel?: string;
}
