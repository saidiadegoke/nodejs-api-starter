import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { SocialAccountEntity } from '../entities/social-account.entity';

@Injectable()
export class SocialAccountRepository {
  private readonly repo: Repository<SocialAccountEntity>;

  constructor(private readonly dataSource: DataSource) {
    this.repo = this.dataSource.getRepository(SocialAccountEntity);
  }

  async findByProvider(provider: string, providerUserId: string): Promise<SocialAccountEntity | null> {
    return this.repo.findOne({ where: { provider, providerUserId } });
  }

  async createSocialAccount(data: Partial<SocialAccountEntity>): Promise<SocialAccountEntity> {
    const account = this.repo.create(data);
    return this.repo.save(account);
  }
}
