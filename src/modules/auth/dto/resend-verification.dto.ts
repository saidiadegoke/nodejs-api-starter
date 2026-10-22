import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEmail, IsString } from 'class-validator';

export class ResendVerificationDto {
  @ApiPropertyOptional({
    description: 'Email address of the candidate/student to resend verification to if unauthenticated',
    example: 'candidate@example.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
