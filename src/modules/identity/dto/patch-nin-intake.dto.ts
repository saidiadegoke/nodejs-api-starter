import { IsObject, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PatchNinIntakeDto {
  @ApiProperty({
    description: 'Partial form fields to merge into intake_payload',
    example: { university_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', subject_combination_id: 'c1b07384-d113-40f4-8a4e-379e4971c260' },
  })
  @IsObject()
  @IsNotEmpty()
  intake_payload: Record<string, any>;
}
