import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { AdminRepository } from '../repositories/admin.repository';
import { CreateAdminUserDto, AdminUsersStatsResponseDto } from '../dto';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';

@Injectable()
export class AdminUsersService {
  private readonly logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly dataSource: DataSource,
    private readonly scopeService: InstitutionUserScopeService,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(AdminUsersService.name);
  }

  /**
   * User stats for the caller's institution. Super admins (and any user without
   * an institution binding) get the global counts; institution users only see
   * their own members.
   */
  async getStats(userId?: string | null): Promise<AdminUsersStatsResponseDto> {
    const universityId = userId ? await this.scopeService.effectiveUniversityId(userId) : null;
    return this.adminRepo.getUsersStats(universityId);
  }

  async createUserWithUniversity(dto: CreateAdminUserDto, actorUserId?: string | null) {
    const existing = await this.dataSource.query(`SELECT id FROM users WHERE email = $1`, [
      dto.email.toLowerCase().trim(),
    ]);
    if (existing.length) {
      throw new ConflictException('User with this email already exists');
    }

    const callerRoles = actorUserId ? await this.scopeService.getUserRoles(actorUserId) : [];
    const isGlobalAdmin = callerRoles.includes('admin') || callerRoles.includes('super_admin');
    const callerUniversityId = actorUserId
      ? await this.scopeService.getProfileJupebUniversityId(actorUserId)
      : null;
    const isInstitutionAdmin =
      !isGlobalAdmin &&
      (callerRoles.includes('institution_admin') ||
        callerRoles.includes('program_director') ||
        Boolean(callerUniversityId));

    let universityId = dto.university_id || null;
    if (isInstitutionAdmin) {
      if (!callerUniversityId) {
        throw new ForbiddenException(
          'Institution users must have profiles.jupeb_university_id set for admin user management',
        );
      }
      if (universityId && String(universityId) !== String(callerUniversityId)) {
        throw new ForbiddenException(
          'Cannot create users for a university outside your institution scope',
        );
      }
      universityId = callerUniversityId;
    }

    const roleName = (dto.role || 'institution_admin').trim();
    let chosenRole: any = null;

    if (universityId) {
      const scopedRoles = await this.dataSource.query(
        `SELECT * FROM roles WHERE LOWER(name) = LOWER($1) AND owner_jupeb_university_id = $2 LIMIT 1`,
        [roleName, universityId],
      );
      if (scopedRoles.length) {
        chosenRole = scopedRoles[0];
      }
    }

    if (!chosenRole) {
      const globalRoles = await this.dataSource.query(
        `SELECT * FROM roles WHERE LOWER(name) = LOWER($1) AND owner_jupeb_university_id IS NULL ORDER BY is_system DESC LIMIT 1`,
        [roleName],
      );
      if (globalRoles.length) {
        chosenRole = globalRoles[0];
      } else {
        const anyRoles = await this.dataSource.query(
          `SELECT * FROM roles WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [roleName],
        );
        if (anyRoles.length) {
          if (
            isInstitutionAdmin &&
            anyRoles[0].owner_jupeb_university_id &&
            String(anyRoles[0].owner_jupeb_university_id) !== String(universityId)
          ) {
            throw new ForbiddenException('Role is outside your institution scope');
          }
          chosenRole = anyRoles[0];
        }
      }
    }

    if (!chosenRole) {
      throw new NotFoundException(`Role "${roleName}" not found`);
    }

    if (isInstitutionAdmin) {
      if (!chosenRole.is_system) {
        if (
          !chosenRole.owner_jupeb_university_id ||
          String(chosenRole.owner_jupeb_university_id) !== String(universityId)
        ) {
          throw new ForbiddenException('Role is outside your institution scope');
        }
      } else {
        const forbidden = ['registrar', 'admin', 'super_admin'];
        if (forbidden.includes(chosenRole.name.toLowerCase())) {
          throw new ForbiddenException(
            `Institution admins cannot assign registrar or central admin roles`,
          );
        }
      }
    }

    let uni: any = null;
    if (universityId) {
      const uniRows = await this.dataSource.query(
        `SELECT id, name, short_name, status FROM jupeb_universities WHERE id = $1 AND deleted_at IS NULL`,
        [universityId],
      );
      if (!uniRows.length || uniRows[0].status !== 'active') {
        throw new NotFoundException('JUPEB university not found or inactive');
      }
      uni = uniRows[0];
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : await bcrypt.hash('TemporaryP@ss123!', 10);

    const { user, binding } = await this.dataSource.transaction(async (manager) => {
      const userRows = await manager.query(
        `INSERT INTO users (email, phone, password_hash, status, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', true, NOW(), NOW())
         RETURNING id, email, phone, status, created_at`,
        [dto.email.toLowerCase().trim(), dto.phone || null, passwordHash],
      );
      const newUser = userRows[0];

      await manager.query(
        `INSERT INTO profiles (user_id, first_name, last_name, jupeb_university_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [newUser.id, dto.first_name, dto.last_name, universityId || null],
      );

      await manager.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
         VALUES ($1, $2, $3, NOW())`,
        [newUser.id, chosenRole.id, actorUserId || null],
      );

      let newBinding: any = null;
      if (universityId) {
        const bindingRows = await manager.query(
          `INSERT INTO user_universities (user_id, university_id, is_primary, role, created_by, created_at, updated_at)
           VALUES ($1, $2, true, $3, $4, NOW(), NOW())
           ON CONFLICT (user_id, university_id) DO UPDATE SET updated_at = NOW()
           RETURNING id, is_primary, role`,
          [newUser.id, universityId, chosenRole.name, actorUserId || null],
        );
        newBinding = bindingRows[0];
      }

      return { user: newUser, binding: newBinding };
    });

    return {
      user: {
        user_id: user.id,
        id: user.id,
        email: user.email,
        phone: user.phone,
        first_name: dto.first_name,
        last_name: dto.last_name,
        role: chosenRole.name,
        status: user.status,
        created_at: user.created_at,
      },
      university: uni
        ? {
            id: uni.id,
            name: uni.name,
            short_name: uni.short_name,
          }
        : null,
      binding: binding
        ? {
            id: binding.id,
            is_primary: binding.is_primary,
            role: binding.role,
          }
        : null,
    };
  }
}

