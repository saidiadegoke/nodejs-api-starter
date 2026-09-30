import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsBoolean, IsInt, Min, Max, IsIn, IsString } from 'class-validator';

export class NotificationQueryDto {
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

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unread_only?: boolean;

  @ApiPropertyOptional({ enum: ['all', 'unread'], example: 'all' })
  @IsOptional()
  @IsIn(['all', 'unread'])
  filter?: 'all' | 'unread';
}

export class UpdateNotificationReadDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_read?: boolean = true;
}

export class CreateNotificationDto {
  @ApiProperty({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsString()
  user_id: string;

  @ApiPropertyOptional({ example: 'general' })
  @IsOptional()
  @IsString()
  type?: string = 'general';

  @ApiPropertyOptional({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  @IsOptional()
  @IsString()
  actor_id?: string | null;

  @ApiProperty({ example: 'Your registration document was approved.' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ example: { action: 'view_document', id: '123' } })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class ActorSummaryDto {
  @ApiPropertyOptional({ example: 'admin@jupeb.edu.ng', nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ example: 'Dr. Ibrahim', nullable: true })
  first_name?: string | null;

  @ApiPropertyOptional({ example: 'Musa', nullable: true })
  last_name?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/actor.jpg', nullable: true })
  photo?: string | null;
}

export class NotificationResponseDto {
  @ApiProperty({ example: 'n0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  id: string;

  @ApiProperty({ example: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  user_id: string;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', nullable: true })
  actor_id?: string | null;

  @ApiProperty({ example: 'registration' })
  type: string;

  @ApiProperty({ example: 'Your registration document has been approved.' })
  message: string;

  @ApiPropertyOptional({ example: { registration_id: 'reg123' } })
  metadata?: Record<string, any> | null;

  @ApiProperty({ example: false })
  is_read: boolean;

  @ApiPropertyOptional({ type: ActorSummaryDto, nullable: true })
  actor?: ActorSummaryDto | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  updated_at: Date;
}

export class NotificationPaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  per_page: number;

  @ApiProperty({ example: 45 })
  total: number;
}

export class NotificationListResponseDto {
  @ApiProperty({ example: 3 })
  unread_count: number;

  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ type: NotificationPaginationMetaDto })
  pagination: NotificationPaginationMetaDto;

  @ApiProperty({ type: [NotificationResponseDto] })
  notifications: NotificationResponseDto[];
}

export class UnreadCountResponseDto {
  @ApiProperty({ example: 5 })
  count: number;
}

export class UpdateReadStatusResponseDto {
  @ApiProperty({ example: 'n0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  id: string;

  @ApiProperty({ example: true })
  is_read: boolean;
}

export class MarkAllReadResponseDto {
  @ApiProperty({ example: 12 })
  updated_count: number;
}

export class DeleteResultResponseDto {
  @ApiProperty({ example: true })
  deleted: boolean;
}
