import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { AdminRepository } from '../repositories/admin.repository';
import { CreateAdminUserDto, AdminUsersStatsResponseDto } from '../dto';

@Injectable()
export class AdminUsersService {
  private readonly logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(AdminUsersService.name);
  }

  async getStats(): Promise<AdminUsersStatsResponseDto> {
    return this.adminRepo.getUsersStats();
  }

  async createUserWithUniversity(dto: CreateAdminUserDto, actorUserId?: string | null) {
    const existing = await this.dataSource.query(`SELECT id FROM users WHERE email = $1`, [
      dto.email.toLowerCase().trim(),
    ]);
    if (existing.length) {
      throw new ConflictException('User with this email already exists');
    }

    if (dto.university_id) {
      const uni = await this.dataSource.query(
        `SELECT id FROM jupeb_universities WHERE id = $1 AND deleted_at IS NULL`,
        [dto.university_id],
      );
      if (!uni.length) throw new NotFoundException('University not found');
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : await bcrypt.hash('TemporaryP@ss123!', 10);

    const user = await this.dataSource.transaction(async (manager) => {
      const userRows = await manager.query(
        `INSERT INTO users (email, phone, password_hash, status, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', true, NOW(), NOW())
         RETURNING id, email, phone, status`,
        [dto.email.toLowerCase().trim(), dto.phone || null, passwordHash],
      );
      const newUser = userRows[0];

      await manager.query(
        `INSERT INTO profiles (user_id, first_name, last_name, jupeb_university_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [newUser.id, dto.first_name, dto.last_name, dto.university_id || null],
      );

      const targetRole = dto.role || 'institution_admin';
      const roleRows = await manager.query(`SELECT id FROM roles WHERE name = $1`, [targetRole]);
      if (roleRows.length) {
        await manager.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
           VALUES ($1, $2, $3, NOW())`,
          [newUser.id, roleRows[0].id, actorUserId || null],
        );
      }

      if (dto.university_id) {
        await manager.query(
          `INSERT INTO user_universities (user_id, jupeb_university_id, is_primary, created_at, updated_at)
           VALUES ($1, $2, true, NOW(), NOW())
           ON CONFLICT (user_id, jupeb_university_id) DO NOTHING`,
          [newUser.id, dto.university_id],
        );
      }

      return newUser;
    });

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      first_name: dto.first_name,
      last_name: dto.last_name,
      university_id: dto.university_id || null,
      role: dto.role || 'institution_admin',
    };
  }
}
