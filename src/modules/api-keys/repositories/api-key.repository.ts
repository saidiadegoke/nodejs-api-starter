import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from '../entities/api-key.entity';

export interface ApiKeyCreatedRecord {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  created_at: Date;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  status: string;
  last_used_at: Date | null;
  created_at: Date;
}

@Injectable()
export class ApiKeyRepository {
  constructor(
    @InjectRepository(ApiKeyEntity)
    private readonly repo: Repository<ApiKeyEntity>,
  ) {}

  async create(
    userId: string,
    name: string,
    keyPrefix: string,
    keyHash: string,
  ): Promise<ApiKeyCreatedRecord> {
    const entity = this.repo.create({
      userId,
      name,
      keyPrefix,
      keyHash,
      status: 'active',
    });
    const saved = await this.repo.save(entity);
    return {
      id: saved.id,
      name: saved.name,
      key_prefix: saved.keyPrefix,
      status: saved.status,
      created_at: saved.createdAt,
    };
  }

  async findByUserId(userId: string): Promise<ApiKeyListItem[]> {
    const records = await this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      key_prefix: r.keyPrefix,
      status: r.status,
      last_used_at: r.lastUsedAt,
      created_at: r.createdAt,
    }));
  }

  async findByHash(keyHash: string): Promise<ApiKeyEntity | null> {
    return await this.repo.findOne({
      where: { keyHash, status: 'active' },
    });
  }

  async revoke(id: string, userId: string): Promise<ApiKeyCreatedRecord | null> {
    const key = await this.repo.findOne({
      where: { id, userId },
    });
    if (!key) {
      return null;
    }
    key.status = 'revoked';
    const saved = await this.repo.save(key);
    return {
      id: saved.id,
      name: saved.name,
      key_prefix: saved.keyPrefix,
      status: saved.status,
      created_at: saved.createdAt,
    };
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }
}
