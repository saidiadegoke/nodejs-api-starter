import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../modules/users/entities/user.entity';
import { ProfileEntity } from '../../../modules/users/entities/profile.entity';

const SUPER_ADMIN_EMAIL = 'admin@example.com';
const SUPER_ADMIN_PHONE = '+2348100000000';
const SUPER_ADMIN_PASSWORD_HASH =
  '$2a$10$jhQRFJ1CV3akvRAY.3lc1uPxrNt68lmZm2YozRyX/NxfYDr.iw/HK';

@Injectable()
export class UserSeedService {
  private readonly logger = new Logger(UserSeedService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profileRepo: Repository<ProfileEntity>,
  ) {}

  async run(): Promise<void> {
    try {
      await this.upsertSuperAdmin();
    } catch (error) {
      this.logger.error(
        `Failed to seed Super Admin user: ${(error as Error).message}`,
      );
    }
  }

  private async upsertSuperAdmin(): Promise<void> {
    let user = await this.userRepo.findOne({
      where: { email: SUPER_ADMIN_EMAIL },
    });

    if (!user) {
      user = await this.userRepo.save(
        this.userRepo.create({
          email: SUPER_ADMIN_EMAIL,
          phone: SUPER_ADMIN_PHONE,
          emailVerified: true,
          phoneVerified: true,
          passwordHash: SUPER_ADMIN_PASSWORD_HASH,
          status: 'active',
        }),
      );
      this.logger.log(`Created Super Admin user (${SUPER_ADMIN_EMAIL})`);
    }

    const existingProfile = await this.profileRepo.findOne({
      where: { userId: user.id },
    });

    if (!existingProfile) {
      await this.profileRepo.save(
        this.profileRepo.create({
          userId: user.id,
          firstName: 'Super',
          lastName: 'Admin',
          displayName: 'Super Admin',
        }),
      );
      this.logger.log(`Created Super Admin profile for user ${user.id}`);
    }
  }
}
