import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiKeyRepository, ApiKeyCreatedRecord, ApiKeyListItem } from '../repositories/api-key.repository';
import { ApiKeyEntity } from '../entities/api-key.entity';

export interface GeneratedApiKeyResponse extends ApiKeyCreatedRecord {
  key: string;
}

@Injectable()
export class ApiKeysService {
  constructor(private readonly apiKeyRepo: ApiKeyRepository) {}

  async generate(userId: string, name: string): Promise<GeneratedApiKeyResponse> {
    if (!name || !name.trim()) {
      throw new BadRequestException('API key name is required');
    }

    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyPrefix = 'sk_live_' + rawKey.substring(0, 8);
    const fullKey = keyPrefix + rawKey.substring(8);
    const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');

    const record = await this.apiKeyRepo.create(userId, name.trim(), keyPrefix, keyHash);

    return {
      id: record.id,
      name: record.name,
      key: fullKey,
      key_prefix: record.key_prefix,
      status: record.status,
      created_at: record.created_at,
    };
  }

  async list(userId: string): Promise<ApiKeyListItem[]> {
    return await this.apiKeyRepo.findByUserId(userId);
  }

  async revoke(id: string, userId: string): Promise<ApiKeyCreatedRecord> {
    const key = await this.apiKeyRepo.revoke(id, userId);
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    return key;
  }

  async authenticate(rawKey: string): Promise<ApiKeyEntity> {
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyRecord = await this.apiKeyRepo.findByHash(keyHash);
    if (!keyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }
    this.apiKeyRepo.touchLastUsed(keyRecord.id).catch(() => {});
    return keyRecord;
  }
}
