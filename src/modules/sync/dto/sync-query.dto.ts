import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SyncEntityType, SyncStatus, SyncTarget } from '../entities/sync-log.entity';

export class ListSyncLogsQueryDto {
  @ApiPropertyOptional({ enum: SyncEntityType })
  @IsOptional()
  @IsEnum(SyncEntityType)
  entity_type?: SyncEntityType;

  @ApiPropertyOptional({ enum: SyncStatus })
  @IsOptional()
  @IsEnum(SyncStatus)
  status?: SyncStatus;

  @ApiPropertyOptional({ enum: SyncTarget })
  @IsOptional()
  @IsEnum(SyncTarget)
  target?: SyncTarget;

  @ApiPropertyOptional({ description: 'Search term by entity_id, job_id, or error_message' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;
}

export class TriggerCandidateSyncDto {
  @ApiPropertyOptional({ description: 'Academic session ID' })
  @IsOptional()
  @IsString()
  session_id?: string;

  @ApiPropertyOptional({ description: 'Specific candidate registration IDs to sync', type: [String] })
  @IsOptional()
  registration_ids?: string[];
}

export class TriggerSubjectSyncDto {
  @ApiPropertyOptional({ description: 'Specific subject IDs to sync (syncs all if empty)', type: [String] })
  @IsOptional()
  subject_ids?: string[];
}

export class TriggerInstitutionSyncDto {
  @ApiPropertyOptional({ description: 'Specific university IDs to sync (syncs all if empty)', type: [String] })
  @IsOptional()
  university_ids?: string[];
}
