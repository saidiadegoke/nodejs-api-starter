import { Injectable } from '@nestjs/common';
import { UserSeedService } from './user/user-seed.service';
import { RbacSeedService } from './rbac/rbac-seed.service';
import { JupebSeedService } from './jupeb/jupeb-seed.service';

@Injectable()
export class SeedService {
  constructor(
    private readonly userSeedService: UserSeedService,
    private readonly rbacSeedService: RbacSeedService,
    private readonly jupebSeedService: JupebSeedService,
  ) {}

  async run(): Promise<void> {
    console.log('🚀 Starting Database Seeding...');
    await this.userSeedService.run();
    await this.rbacSeedService.run();
    await this.jupebSeedService.run();
    console.log('✅ Database Seeding Completed Successfully.');
  }
}
