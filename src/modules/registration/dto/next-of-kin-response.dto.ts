import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NextOfKinResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'e5b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiProperty({ example: 'Mrs. Folashade Adeyemi' })
  name: string;

  @ApiProperty({ example: 'mother' })
  relationship: string;

  @ApiPropertyOptional({ example: '+2348098765432' })
  phone?: string | null;

  @ApiPropertyOptional({ example: 'folashade@example.com' })
  email?: string | null;

  @ApiPropertyOptional({ example: '123 Campus Way, Lagos' })
  address?: string | null;

  @ApiProperty({ example: 'student', enum: ['nin', 'student', 'institution'] })
  source: string;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  updated_at: string;
}
