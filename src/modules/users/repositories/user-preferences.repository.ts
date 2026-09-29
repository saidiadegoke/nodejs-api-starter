import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserPreferenceEntity } from '../entities/user-preference.entity';

export interface UserPreferencesDto {
  push_notifications_enabled: boolean;
  biometric_login_enabled: boolean;
}

const DEFAULTS: UserPreferencesDto = {
  push_notifications_enabled: true,
  biometric_login_enabled: false,
};

@Injectable()
export class UserPreferencesRepository {
  constructor(
    @InjectRepository(UserPreferenceEntity)
    private readonly repo: Repository<UserPreferenceEntity>,
  ) {}

  defaults(): UserPreferencesDto {
    return { ...DEFAULTS };
  }

  async findByUserId(userId: string): Promise<UserPreferencesDto | null> {
    const record = await this.repo.findOne({ where: { userId } });
    if (!record) return null;
    return {
      push_notifications_enabled: Boolean(record.pushNotificationsEnabled),
      biometric_login_enabled: Boolean(record.biometricLoginEnabled),
    };
  }

  async upsert(userId: string, fields: Partial<UserPreferencesDto>): Promise<UserPreferencesDto> {
    const current = (await this.findByUserId(userId)) || this.defaults();
    const push =
      fields.push_notifications_enabled !== undefined
        ? Boolean(fields.push_notifications_enabled)
        : current.push_notifications_enabled;
    const biometric =
      fields.biometric_login_enabled !== undefined
        ? Boolean(fields.biometric_login_enabled)
        : current.biometric_login_enabled;

    let record = await this.repo.findOne({ where: { userId } });
    if (!record) {
      record = this.repo.create({
        userId,
        pushNotificationsEnabled: push,
        biometricLoginEnabled: biometric,
      });
    } else {
      record.pushNotificationsEnabled = push;
      record.biometricLoginEnabled = biometric;
    }

    const saved = await this.repo.save(record);
    return {
      push_notifications_enabled: Boolean(saved.pushNotificationsEnabled),
      biometric_login_enabled: Boolean(saved.biometricLoginEnabled),
    };
  }
}
