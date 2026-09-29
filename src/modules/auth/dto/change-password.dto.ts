import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'Current@Password123', description: 'Existing user password' })
  @IsNotEmpty({ message: 'Current password is required' })
  @IsString()
  current_password!: string;

  @ApiProperty({ example: 'NewStrong@Password123', description: 'New password (min 8 characters)' })
  @IsNotEmpty({ message: 'New password is required' })
  @Length(8, 255, { message: 'New password must be at least 8 characters' })
  new_password!: string;
}
