import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsIn,
  IsArray,
  IsUUID,
} from 'class-validator';

export class CreateSupportTicketDto {
  @ApiProperty({ example: 'academic', description: 'Ticket category' })
  @IsNotEmpty()
  @IsString()
  category: string;

  @ApiProperty({ example: 'Subject Combination Issue', description: 'Ticket subject line' })
  @IsNotEmpty()
  @IsString()
  subject: string;

  @ApiProperty({ example: 'I need assistance changing my subject combination from PCM to PCB.' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string = 'normal';

  @ApiPropertyOptional({ example: ['https://cdn.example.com/attachments/slip.png'] })
  @IsOptional()
  @IsArray()
  attachments?: any[];
}

export class AddTicketMessageDto {
  @ApiProperty({ example: 'Here is the additional information requested.' })
  @IsNotEmpty()
  @IsString()
  message: string;

  @ApiPropertyOptional({ example: ['https://cdn.example.com/attachments/slip.png'] })
  @IsOptional()
  @IsArray()
  attachments?: any[];
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: ['open', 'in_progress', 'resolved', 'closed'], example: 'resolved' })
  @IsNotEmpty()
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status: string;

  @ApiPropertyOptional({ example: 'Issue resolved with registrar.' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ example: 'Subject combination has been updated.' })
  @IsOptional()
  @IsString()
  resolution_notes?: string;

  @ApiPropertyOptional({ example: 'Subject combination has been updated.' })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

export class AdminUpdateTicketDto {
  @ApiPropertyOptional({ enum: ['open', 'in_progress', 'resolved', 'closed'] })
  @IsOptional()
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status?: string;

  @ApiPropertyOptional({ enum: ['low', 'normal', 'high', 'urgent'] })
  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID('4')
  assigned_to?: string | null;

  @ApiPropertyOptional({ example: 'General Support' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Subject combination has been updated.' })
  @IsOptional()
  @IsString()
  resolution_notes?: string;

  @ApiPropertyOptional({ example: 'Subject combination has been updated.' })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

export class ListTicketsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by ticket status or multiple comma-separated statuses (e.g. "open,closed" or repeated ?status=open&status=closed)',
    example: 'open,closed',
  })
  @IsOptional()
  status?: string | string[];

  @ApiPropertyOptional({
    description: 'Alias for status filter',
    example: 'open,closed',
  })
  @IsOptional()
  statuses?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by priority or multiple comma-separated priorities (e.g. "high,urgent")',
    example: 'high,urgent',
  })
  @IsOptional()
  priority?: string | string[];

  @ApiPropertyOptional({
    description: 'Filter by category or multiple comma-separated categories',
    example: 'Registration,Attendance issue',
  })
  @IsOptional()
  category?: string | string[];

  @ApiPropertyOptional({ example: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({
    description: 'Filter tickets created on or after this date (ISO 8601 or YYYY-MM-DD)',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  start_date?: string;

  @ApiPropertyOptional({
    description: 'Alias for start_date',
    example: '2026-10-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter tickets created on or before this date (ISO 8601 or YYYY-MM-DD)',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsString()
  end_date?: string;

  @ApiPropertyOptional({
    description: 'Alias for end_date',
    example: '2026-10-31',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Search matching ticket number, student name, student codes, email, phone, subject, or message',
    example: 'Quadri',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Alias for q search term',
    example: 'Quadri',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Alias for q search term',
    example: 'Quadri',
  })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({
    description: 'Alias for q search term',
    example: 'Quadri',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  from_date?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  to_date?: string;
}

export class SupportCategoryItemDto {
  @ApiProperty({ example: 'academic' })
  id: string;

  @ApiProperty({ example: 'Academic / Course Combination' })
  name: string;

  @ApiProperty({ example: 'Issues relating to subjects, scores, or results.' })
  description: string;
}

export class SupportMessageSenderDto {
  @ApiPropertyOptional({ example: 'student@example.com', nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ example: 'Chukwuma Adeyemi', nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/avatar.jpg', nullable: true })
  avatar_url?: string | null;
}

export class SupportMessageResponseDto {
  @ApiProperty({ example: 'm0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  id: string;

  @ApiProperty({ example: 't0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  ticket_id: string;

  @ApiProperty({ example: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55' })
  sender_id: string;

  @ApiProperty({ example: 'student' })
  sender_role: string;

  @ApiProperty({ example: 'My inquiry message details...' })
  message: string;

  @ApiProperty({ type: [Object], example: [] })
  attachments: any[];

  @ApiPropertyOptional({ type: SupportMessageSenderDto, nullable: true })
  sender?: SupportMessageSenderDto | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;
}

export class SupportTicketResponseDto {
  @ApiProperty({ example: 't0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  id: string;

  @ApiProperty({ example: 'TICK-2026-00123' })
  ticket_number: string;

  @ApiProperty({ example: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55' })
  user_id: string;

  @ApiPropertyOptional({ example: 'uni-123', nullable: true })
  university_id?: string | null;

  @ApiPropertyOptional({ example: 'reg-123', nullable: true })
  registration_id?: string | null;

  @ApiProperty({ example: 'academic' })
  category: string;

  @ApiProperty({ example: 'Subject Combination Issue' })
  subject: string;

  @ApiProperty({ example: 'I need assistance changing my subject combination.' })
  message: string;

  @ApiProperty({ example: 'normal' })
  priority: string;

  @ApiProperty({ example: 'open' })
  status: string;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', nullable: true })
  assigned_to?: string | null;

  @ApiPropertyOptional({ example: '2026-10-12T12:00:00.000Z', nullable: true })
  resolved_at?: Date | null;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', nullable: true })
  resolved_by?: string | null;

  @ApiPropertyOptional({ example: 'Subject combination has been updated in the portal.', nullable: true })
  resolution_notes?: string | null;

  @ApiPropertyOptional({ example: 'UNILAG', nullable: true })
  university_name?: string | null;

  @ApiPropertyOptional({ example: 'Chukwuma Adeyemi', nullable: true })
  user_name?: string | null;

  @ApiPropertyOptional({ example: 'Chukwuma', nullable: true })
  user_first_name?: string | null;

  @ApiPropertyOptional({ example: 'Adeyemi', nullable: true })
  user_last_name?: string | null;

  @ApiPropertyOptional({ example: 'student@example.com', nullable: true })
  user_email?: string | null;

  @ApiPropertyOptional({ example: '08012345678', nullable: true })
  user_phone?: string | null;

  @ApiPropertyOptional({ example: '284300001', nullable: true })
  candidate_code?: string | null;

  @ApiPropertyOptional({ example: '284300001', nullable: true })
  jupeb_candidate_number?: string | null;

  @ApiPropertyOptional({ example: '4300018', nullable: true })
  provisional_candidate_code?: string | null;

  @ApiPropertyOptional({ example: 'MAT/2026/001', nullable: true })
  institution_issued_code?: string | null;

  @ApiPropertyOptional({ type: [SupportMessageResponseDto] })
  messages?: SupportMessageResponseDto[];

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  updated_at: Date;
}

export class SupportPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 45 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class SupportTicketListResponseDto {
  @ApiProperty({ example: true })
  success?: boolean;

  @ApiPropertyOptional({ type: [SupportTicketResponseDto] })
  data?: SupportTicketResponseDto[];

  @ApiPropertyOptional({ type: [SupportTicketResponseDto] })
  rows?: SupportTicketResponseDto[];

  @ApiProperty({ type: [SupportTicketResponseDto] })
  tickets: SupportTicketResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 45 })
  total: number;

  @ApiPropertyOptional({ example: 3 })
  totalPages?: number;

  @ApiPropertyOptional({ type: SupportPaginationMetaDto })
  pagination?: SupportPaginationMetaDto;
}

export class SupportStatsResponseDto {
  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ example: 35 })
  open: number;

  @ApiProperty({ example: 25 })
  in_progress: number;

  @ApiProperty({ example: 60 })
  resolved: number;

  @ApiProperty({ example: 0 })
  closed: number;

  @ApiPropertyOptional({ type: [Object], example: [] })
  by_university?: any[];

  @ApiPropertyOptional({ type: [Object], example: [] })
  by_category?: any[];
}
