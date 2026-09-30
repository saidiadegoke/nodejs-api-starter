import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewStrong@Password1', description: 'New password (min 8 characters)' })
  @IsNotEmpty({ message: 'Password is required' })
  @Length(8, 255, { message: 'Password must be at least 8 characters' })
  new_password!: string;

  @ApiPropertyOptional({ example: 'b5f2c4...hex_token', description: 'Password reset token from email' })
  @IsOptional()
  @IsString()
  token?: string;

  @ApiPropertyOptional({ example: '123456', description: '6-digit OTP code if reset via OTP' })
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code?: string;

  @ApiPropertyOptional({ example: 'student@example.com', description: 'Identifier required when redeeming via code' })
  @IsOptional()
  @IsString()
  identifier?: string;
}
