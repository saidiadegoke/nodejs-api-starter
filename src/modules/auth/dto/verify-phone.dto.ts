import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyPhoneDto {
  @ApiProperty({ example: '123456', description: '6-digit OTP verification code' })
  @IsNotEmpty({ message: 'OTP is required' })
  @Matches(/^\d{6}$/, { message: 'OTP must be 6 digits' })
  otp!: string;

  @ApiPropertyOptional({ example: 'student@example.com', description: 'User email or phone' })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Legacy phone field' })
  @IsOptional()
  @IsString()
  phone?: string;
}
