import { Injectable } from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { AdminRepository } from '../repositories/admin.repository';
import { UpdatePlatformSettingDto, PlatformSettingResponseDto } from '../dto';

@Injectable()
export class AdminSettingsService {
  private readonly logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(AdminSettingsService.name);
  }

  async getAll(): Promise<PlatformSettingResponseDto[]> {
    const settings = await this.adminRepo.getAllSettings();
    return settings.map((s) => ({
      key: s.key,
      value: typeof s.value === 'string' ? JSON.parse(s.value) : s.value,
      description: s.description || null,
      updated_at: s.updatedAt,
    }));
  }

  async update(dto: UpdatePlatformSettingDto, userId?: string | null): Promise<PlatformSettingResponseDto> {
    const setting = await this.adminRepo.upsertSetting(
      dto.key,
      dto.value,
      dto.description,
      userId,
    );
    return {
      key: setting.key,
      value: typeof setting.value === 'string' ? JSON.parse(setting.value) : setting.value,
      description: setting.description || null,
      updated_at: setting.updatedAt,
    };
  }
}
