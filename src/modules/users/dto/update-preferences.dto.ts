import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({ example: true, description: 'Enable push notifications' })
  @IsOptional()
  @IsBoolean()
  push_notifications_enabled?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Enable biometric login' })
  @IsOptional()
  @IsBoolean()
  biometric_login_enabled?: boolean;
}
