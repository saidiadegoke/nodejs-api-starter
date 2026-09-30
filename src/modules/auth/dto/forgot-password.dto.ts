import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@example.com', description: 'Registered email or phone number' })
  @IsNotEmpty({ message: 'Email or phone is required' })
  @IsString()
  identifier!: string;

  @ApiPropertyOptional({ example: 'token', enum: ['token', 'otp'], description: 'Delivery mechanism (token or otp)' })
  @IsOptional()
  @IsIn(['token', 'otp'], { message: "delivery must be 'token' or 'otp'" })
  delivery?: string;

  @ApiPropertyOptional({ example: 'email', enum: ['email', 'sms', 'both'], description: 'Notification channel' })
  @IsOptional()
  @IsIn(['email', 'sms', 'both'], { message: "channel must be 'email', 'sms', or 'both'" })
  channel?: string;
}
