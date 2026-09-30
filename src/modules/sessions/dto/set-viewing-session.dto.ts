import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetViewingSessionDto {
  @ApiProperty({
    description: 'Academic session ID to set as user viewing preference',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsUUID('4')
  @IsNotEmpty()
  session_id: string;
}
