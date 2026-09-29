import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: '4a9b2c3d-e5f6-7890-abcd-ef1234567890', description: 'Refresh token issued during login' })
  @IsNotEmpty({ message: 'Refresh token is required' })
  @IsString()
  refresh_token!: string;
}
