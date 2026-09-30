import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmissionDocumentResponseDto {
  @ApiProperty({ example: 'b1c2d3e4-f5a6-7890-1234-56789abcdef0' })
  id: string;

  @ApiProperty({ example: 'c2d3e4f5-a6b7-8901-2345-6789abcdef01' })
  registration_id: string;

  @ApiProperty({ example: 'a0b1c2d3-e4f5-6789-0123-456789abcdef' })
  requirement_id: string;

  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  file_id: string;

  @ApiProperty({ example: 'submitted', enum: ['submitted', 'accepted', 'rejected', 'replaced', 'deleted'] })
  status: string;

  @ApiPropertyOptional({ example: 'waec' })
  source?: string;

  @ApiPropertyOptional({ example: 1 })
  sitting?: number;

  @ApiPropertyOptional({ example: 'secondary' })
  institution_type?: string;

  @ApiPropertyOptional({ example: 'Verified valid' })
  review_note?: string;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  created_at?: string;

  @ApiPropertyOptional({
    example: { id: 'ocr-job-uuid', status: 'queued' },
    description: 'Auto-queued OCR job if exam certificate upload',
  })
  ocr_job?: { id: string; status: string };
}

export class RequirementWithCompletionDto {
  @ApiProperty({ example: 'a0b1c2d3-e4f5-6789-0123-456789abcdef' })
  id: string;

  @ApiProperty({ example: 'waec_result' })
  key: string;

  @ApiProperty({ example: 'WAEC Result / Certificate' })
  title: string;

  @ApiProperty({ example: true })
  is_mandatory: boolean;

  @ApiProperty({ example: 1 })
  min_count: number;

  @ApiProperty({ example: 2 })
  max_count: number;

  @ApiProperty({ example: 5 })
  max_file_size_mb: number;

  @ApiProperty({ example: ['application/pdf', 'image/jpeg', 'image/png'] })
  allowed_mime_types: string[];

  @ApiProperty({ example: true, description: 'Whether the current candidate has satisfied this requirement' })
  satisfied: boolean;
}

export class CompletenessResponseDto {
  @ApiProperty({ example: 'c2d3e4f5-a6b7-8901-2345-6789abcdef01' })
  registration_id: string;

  @ApiProperty({ example: true, description: 'True if all mandatory documents have been uploaded and accepted/submitted' })
  complete: boolean;

  @ApiProperty({ example: [], description: 'List of missing mandatory requirement keys' })
  missing_keys: string[];
}

export class DocumentDownloadUrlResponseDto {
  @ApiProperty({ example: 'b1c2d3e4-f5a6-7890-1234-56789abcdef0' })
  document_id: string;

  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  file_id: string;

  @ApiPropertyOptional({ example: 'waec_certificate.pdf' })
  file_name?: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  file_type?: string;

  @ApiProperty({ example: 'https://storage.googleapis.com/... or signed url' })
  url: string;

  @ApiProperty({ example: '2026-09-29T12:05:00.000Z' })
  expires_at: string;
}
