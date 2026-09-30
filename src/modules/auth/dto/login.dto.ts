import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'admin@example.com',
    description: 'Email, E.164 phone number, provisional reg code (e.g. 1234567), or final matric number',
  })
  @IsNotEmpty({ message: 'Email or phone is required' })
  @IsString()
  identifier!: string;

  @ApiProperty({
    example: 'Admin@12',
    description: 'Account password',
  })
  @IsNotEmpty({ message: 'Password is required' })
  @IsString()
  password!: string;

  @ApiPropertyOptional({
    example: { ip_address: '127.0.0.1', user_agent: 'Mozilla/5.0...' },
    description: 'Optional client device metadata',
  })
  @IsOptional()
  device_info?: Record<string, unknown>;
}
