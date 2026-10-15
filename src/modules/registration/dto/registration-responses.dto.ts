import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegistrationListItemDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'e5b07384-d113-40f4-8a4e-379e4971c260' })
  session_id: string;

  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  university_id: string;

  @ApiPropertyOptional({ example: 'University of Lagos' })
  university_name?: string;

  @ApiPropertyOptional({ example: 'UNILAG' })
  university_code?: string;

  @ApiPropertyOptional({ example: 'Adewale' })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Adeyemi' })
  last_name?: string;

  @ApiPropertyOptional({ example: 'Oluwaseun' })
  middle_name?: string;

  @ApiPropertyOptional({ example: 'Adewale Adeyemi' })
  full_name?: string;

  @ApiPropertyOptional({ example: 'candidate@example.com' })
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  phone?: string;

  @ApiPropertyOptional({ example: '8901' })
  nin_last4?: string;

  @ApiPropertyOptional({ example: '1234567' })
  provisional_candidate_code?: string;

  @ApiPropertyOptional({ example: '270010001' })
  jupeb_candidate_number?: string;

  @ApiProperty({ example: 'approved' })
  status: string;

  @ApiPropertyOptional({ example: 'c1b07384-d113-40f4-8a4e-379e4971c260' })
  subject_combination_id?: string;

  @ApiPropertyOptional({ example: 'PCB' })
  subject_combination_code?: string;

  @ApiPropertyOptional({ example: 'Physics, Chemistry, Biology' })
  subject_combination_title?: string;

  @ApiProperty({ example: true })
  has_biometrics: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/captured-face.jpg' })
  captured_photo_url?: string;

  @ApiPropertyOptional({ example: 'https://example.com/captured-face.jpg' })
  captured_photo?: string;

  @ApiPropertyOptional({ example: 'https://example.com/captured-face.jpg' })
  face_photo_url?: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  photo_url?: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  profile_photo_url?: string;

  @ApiPropertyOptional({ example: { name: 'Jane Doe', relationship: 'mother', phone: '08012345678' } })
  next_of_kin?: any;

  @ApiPropertyOptional()
  candidate?: any;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: string;
}

export class RegistrationOverviewStatsDto {
  @ApiProperty({ example: 1250 })
  total: number;

  @ApiProperty({ example: 1100 })
  approved: number;

  @ApiProperty({ example: 100 })
  pending: number;

  @ApiProperty({ example: 50 })
  rejected: number;

  @ApiProperty({ example: 980 })
  biometric: number;

  @ApiProperty({ example: 270 })
  without_biometric: number;

  @ApiProperty({ example: 18 })
  total_subject_combinations: number;
}

export class CodeStatusResponseDto {
  @ApiProperty({ example: true })
  claimed: boolean;

  @ApiPropertyOptional({ example: 'Adewale' })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Oluwaseun' })
  middle_name?: string;

  @ApiPropertyOptional({ example: 'Adeyemi' })
  last_name?: string;

  @ApiPropertyOptional({ example: 'Adewale Oluwaseun Adeyemi' })
  display_name?: string;

  @ApiPropertyOptional({ example: 'University of Lagos' })
  university_name?: string;

  @ApiProperty({ example: 'claimed' })
  status: string;
}

export class SubmissionPreviewResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiPropertyOptional()
  candidate?: any;

  @ApiPropertyOptional()
  basic_information?: any;

  @ApiPropertyOptional()
  contact_information?: any;

  @ApiPropertyOptional({ example: { name: 'Jane Doe', relationship: 'mother', phone: '08012345678' } })
  next_of_kin?: any;

  @ApiPropertyOptional()
  subject_combination?: any;

  @ApiPropertyOptional()
  university?: any;

  @ApiPropertyOptional()
  session?: any;

  @ApiPropertyOptional()
  nin_verification?: any;

  @ApiPropertyOptional()
  documents?: any[];

  @ApiPropertyOptional()
  biometrics?: any[];

  @ApiPropertyOptional({ example: 'complete' })
  biometric_status?: string;

  @ApiPropertyOptional({ example: 'https://example.com/captured-face.jpg' })
  captured_photo_url?: string;

  @ApiPropertyOptional({ example: 'https://example.com/captured-face.jpg' })
  captured_photo?: string;

  @ApiPropertyOptional({ example: 'https://example.com/captured-face.jpg' })
  face_photo_url?: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  photo_url?: string;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  profile_photo_url?: string;

  @ApiProperty({ example: true })
  profile_completed: boolean;

  @ApiProperty({ example: true })
  documents_completed: boolean;

  @ApiProperty({ example: true })
  biometrics_completed: boolean;

  @ApiProperty({ example: true })
  subjects_confirmed: boolean;

  @ApiProperty({ example: true })
  can_submit: boolean;

  @ApiProperty({ example: [] })
  missing_items: string[];
}
