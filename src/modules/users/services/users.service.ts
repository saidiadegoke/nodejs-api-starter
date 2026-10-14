import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { UserRepository, UserListOptions } from '../repositories/user.repository';
import { ProfileRepository } from '../repositories/profile.repository';
import { UserEntity } from '../entities/user.entity';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly scopeService: InstitutionUserScopeService,
  ) {}

  private formatUser(row: any) {
    if (!row) return null;
    const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.display_name || row.email;
    const institution = row.jupeb_university_id
      ? {
          id: row.jupeb_university_id,
          code: row.jupeb_university_code,
          short_name: row.jupeb_university_short_name,
          name: row.jupeb_university_name,
        }
      : null;

    return {
      ...row,
      full_name: fullName,
      fullName,
      name: fullName,
      firstName: row.first_name,
      lastName: row.last_name,
      first_name: row.first_name,
      last_name: row.last_name,
      institution,
      university: institution,
      institution_id: row.jupeb_university_id,
      institution_name: row.jupeb_university_name,
      institution_code: row.jupeb_university_code,
      roles: Array.isArray(row.roles) ? row.roles : [],
    };
  }

  async getAllUsers(
    page = 1,
    limit = 10,
    search?: string,
    currentUserId?: string,
    options: {
      role?: string;
      include_all?: string | boolean;
      include_students?: string | boolean;
      include_institution?: string | boolean;
      exclude_roles?: string;
    } = {},
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    // Institution users only see members of their own university; super admins
    // (and unbound users) keep the global list.
    const universityId = currentUserId
      ? await this.scopeService.effectiveUniversityId(currentUserId)
      : null;

    const includeAll = options.include_all === true || options.include_all === 'true';
    let excludeRoleNames: string[] = [];
    if (!includeAll && !options.role) {
      if (options.exclude_roles) {
        excludeRoleNames = options.exclude_roles.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        excludeRoleNames = ['student', 'institution_admin', 'program_director'];
      }
    }

    const filterOptions: UserListOptions = {
      q: search?.trim() || undefined,
      role: options.role?.trim() || undefined,
      universityId: universityId || undefined,
      excludeRoleNames: excludeRoleNames.length ? excludeRoleNames : undefined,
    };

    const users = await this.userRepo.findAll(limitNum, offset, filterOptions.q, filterOptions);
    const total = await this.userRepo.count(filterOptions.q, filterOptions);
    const formatted = users.map((u: any) => this.formatUser(u));

    return {
      users: formatted,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async getUserById(userId: string, currentUserId?: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (currentUserId) {
      const callerUniId = await this.scopeService.effectiveUniversityId(currentUserId);
      if (callerUniId) {
        let inScope = false;
        if (user.jupeb_university_id && String(user.jupeb_university_id) === String(callerUniId)) {
          inScope = true;
        } else {
          const targetUniId = await this.scopeService.getProfileJupebUniversityId(userId);
          inScope = String(targetUniId) === String(callerUniId);
        }
        if (!inScope) {
          throw new ForbiddenException('User is outside your institution scope');
        }
      }
    }
    return this.formatUser(user);
  }

  async updateUser(userId: string, updateData: Partial<UserEntity> & { first_name?: string; last_name?: string }) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userFields: Partial<UserEntity> = {};
    if (updateData.email !== undefined) userFields.email = updateData.email;
    if (updateData.phone !== undefined) userFields.phone = updateData.phone;
    if (updateData.status !== undefined) userFields.status = updateData.status;

    if (Object.keys(userFields).length > 0) {
      await this.userRepo.update(userId, userFields);
    }

    if (updateData.first_name !== undefined || updateData.last_name !== undefined) {
      await this.profileRepo.upsert(userId, {
        firstName: updateData.first_name,
        lastName: updateData.last_name,
      });
    }

    return await this.getUserById(userId);
  }

  async activateUser(userId: string) {
    const user = await this.userRepo.updateStatus(userId, 'active');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async deactivateUser(userId: string) {
    const user = await this.userRepo.updateStatus(userId, 'inactive');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string) {
    return await this.userRepo.findByEmail(email);
  }

  async findByPhone(phone: string) {
    return await this.userRepo.findByPhone(phone);
  }

  async findByEmailOrPhone(identifier: string) {
    return await this.userRepo.findByEmailOrPhone(identifier);
  }

  async create(userData: Partial<UserEntity>) {
    return await this.userRepo.create(userData);
  }

  async softDelete(userId: string) {
    return await this.userRepo.softDelete(userId);
  }

  async getUsersStats(userId?: string | null) {
    const universityId = userId ? await this.scopeService.effectiveUniversityId(userId) : null;
    const scope = [universityId || null];
    const inScope = `
      p.jupeb_university_id = $1
      OR EXISTS (
        SELECT 1 FROM user_universities uu
        WHERE uu.user_id = u.id
          AND (uu.jupeb_university_id = $1 OR uu.university_id = $1)
          AND uu.deleted_at IS NULL
      )`;

    const rows = await (this.userRepo as any).dataSource.query(
      `
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE u.status = 'active')::int AS active_users,
        COUNT(*) FILTER (WHERE u.status <> 'active')::int AS inactive_users,
        COUNT(*) FILTER (WHERE u.email_verified = true)::int AS verified_emails
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.deleted_at IS NULL
        AND ($1::uuid IS NULL OR ${inScope})
    `,
      scope,
    );

    const adminCountRows = await (this.userRepo as any).dataSource.query(
      `
      SELECT COUNT(DISTINCT ur.user_id)::int AS count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      JOIN users u ON u.id = ur.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE r.name IN ('institution_admin', 'admin', 'super_admin')
        AND u.deleted_at IS NULL
        AND ($1::uuid IS NULL OR ${inScope})
    `,
      scope,
    );

    const roleCountRows = await (this.userRepo as any).dataSource.query(`
      SELECT COUNT(*)::int AS count
      FROM roles
      WHERE status = 'active' OR status IS NULL
    `);

    const totalRoles = Number(roleCountRows[0]?.count) || 0;
    const r = rows[0] || {};
    return {
      total_users: Number(r.total_users) || 0,
      active_users: Number(r.active_users) || 0,
      inactive_users: Number(r.inactive_users) || 0,
      verified_emails: Number(r.verified_emails) || 0,
      institution_admins: Number(adminCountRows[0]?.count) || 0,
      total_roles: totalRoles,
    };
  }
}
