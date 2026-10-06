import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  RoleEntity,
  PermissionEntity,
  RolePermissionEntity,
  UserRoleEntity,
  PlatformSettingEntity,
  RequestLogEntity,
} from '../entities/admin.entity';
import {
  ListRbacQueryDto,
  ListErrorLogsQueryDto,
} from '../dto/admin.dto';

@Injectable()
export class AdminRepository {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(PlatformSettingEntity)
    private readonly settingRepo: Repository<PlatformSettingEntity>,
    @InjectRepository(RequestLogEntity)
    private readonly logRepo: Repository<RequestLogEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ==========================================
  // Roles
  // ==========================================

  async listRoles(query: ListRbacQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(10000, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const qb = this.roleRepo.createQueryBuilder('r');
    if (query.q) {
      qb.andWhere('(r.name ILIKE :q OR r.displayName ILIKE :q OR r.description ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    const rawIsSystem: any = query.is_system !== undefined ? query.is_system : query.isSystem;
    if (rawIsSystem !== undefined) {
      const isSystemVal =
        rawIsSystem === true || rawIsSystem === 'true' || rawIsSystem === 1 || rawIsSystem === '1';
      qb.andWhere('r.isSystem = :is_system', { is_system: isSystemVal });
    }

    qb.orderBy('r.isSystem', 'DESC')
      .addOrderBy('r.name', 'ASC')
      .limit(limit)
      .offset(offset);

    const [roles, total] = await qb.getManyAndCount();
    return { roles, total, page, limit };
  }

  async findRoleById(id: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({ where: { id } });
  }

  async findRoleByName(name: string): Promise<RoleEntity | null> {
    return this.roleRepo.findOne({
      where: { name: name.trim() },
    });
  }

  async createRole(data: Partial<RoleEntity>): Promise<RoleEntity> {
    const role = this.roleRepo.create(data);
    return this.roleRepo.save(role);
  }

  async updateRole(id: string, updates: Partial<RoleEntity>): Promise<RoleEntity | null> {
    await this.roleRepo.update(id, updates);
    return this.findRoleById(id);
  }

  async deleteRole(id: string): Promise<boolean> {
    const result = await this.roleRepo.delete(id);
    return (result.affected || 0) > 0;
  }

  // ==========================================
  // Permissions
  // ==========================================

  async listPermissions(query: ListRbacQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(10000, Math.max(1, Number(query.limit) || 50));
    const offset = (page - 1) * limit;

    const qb = this.permissionRepo.createQueryBuilder('p');
    if (query.q) {
      qb.andWhere('(p.name ILIKE :q OR p.description ILIKE :q)', { q: `%${query.q}%` });
    }
    if (query.module || query.resource) {
      const mod = query.module || query.resource;
      qb.andWhere('(p.resource ILIKE :module OR p.name ILIKE :modPrefix)', {
        module: mod,
        modPrefix: `${mod}.%`,
      });
    }

    qb.orderBy('p.name', 'ASC')
      .limit(limit)
      .offset(offset);

    const [permissions, total] = await qb.getManyAndCount();
    return { permissions, total, page, limit };
  }

  async listPermissionsGroupedByRole(query: ListRbacQueryDto) {
    const rolesResult = await this.listRoles({
      page: query.page,
      limit: query.limit || 200,
      q: query.q,
      status: query.status,
      is_system: query.is_system,
    });

    const groups = [];
    for (const role of rolesResult.roles) {
      const perms = await this.getRolePermissions(role.id);
      groups.push({
        role_id: role.id,
        role_name: role.name,
        display_name: role.displayName || role.name,
        permissions: perms.map((p) => ({
          id: p.id,
          name: p.name,
          module: p.resource || (p.name ? p.name.split('.')[0] : 'general'),
          description: p.description,
          created_at: p.createdAt,
        })),
      });
    }
    return groups;
  }

  async findPermissionById(id: string): Promise<PermissionEntity | null> {
    return this.permissionRepo.findOne({ where: { id } });
  }

  async findPermissionByName(name: string): Promise<PermissionEntity | null> {
    return this.permissionRepo.findOne({ where: { name: name.trim() } });
  }

  async createPermission(data: Partial<PermissionEntity>): Promise<PermissionEntity> {
    const p = this.permissionRepo.create(data);
    return this.permissionRepo.save(p);
  }

  async updatePermission(id: string, updates: Partial<PermissionEntity>): Promise<PermissionEntity | null> {
    await this.permissionRepo.update(id, updates);
    return this.findPermissionById(id);
  }

  async deletePermission(id: string): Promise<boolean> {
    const result = await this.permissionRepo.delete(id);
    return (result.affected || 0) > 0;
  }

  // ==========================================
  // Role Permissions
  // ==========================================

  async getRolePermissions(roleId: string): Promise<PermissionEntity[]> {
    const rows = await this.permissionRepo
      .createQueryBuilder('p')
      .innerJoin('role_permissions', 'rp', 'rp.permission_id = p.id')
      .where('rp.role_id = :roleId', { roleId })
      .orderBy('p.name', 'ASC')
      .getMany();
    return rows;
  }

  async attachPermissionToRole(roleId: string, permissionId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [roleId, permissionId],
    );
  }

  async detachPermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    await this.rolePermissionRepo.delete({ roleId, permissionId });
  }

  // ==========================================
  // User Roles
  // ==========================================

  async getUserRoles(userId: string): Promise<{ id: string; name: string; display_name: string }[]> {
    const rows = await this.dataSource.query(
      `SELECT r.id, r.name, r.display_name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       ORDER BY r.name ASC`,
      [userId],
    );
    return rows;
  }

  async setUserRoles(
    userId: string,
    options: {
      roles?: string[];
      roleIds?: string[];
      add?: string[];
      remove?: string[];
    },
    actorUserId?: string | null,
  ): Promise<void> {
    const rawRoles = options.roles || options.roleIds;
    const rawAdd = options.add;
    const rawRemove = options.remove;

    await this.dataSource.transaction(async (manager) => {
      // 1. Full replacement mode
      if (rawRoles !== undefined) {
        await manager.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        if (rawRoles.length > 0) {
          const stringTokens = rawRoles.map((r) => String(r).trim()).filter(Boolean);
          if (stringTokens.length > 0) {
            const roles = await manager.query(
              `SELECT id, name FROM roles WHERE name = ANY($1) OR id::text = ANY($1)`,
              [stringTokens],
            );
            for (const role of roles) {
              await manager.query(
                `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
                 VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id, role_id) DO NOTHING`,
                [userId, role.id, actorUserId || null],
              );
            }
          }
        }
      }

      // 2. Incremental remove
      if (rawRemove && rawRemove.length > 0) {
        const removeTokens = rawRemove.map((r) => String(r).trim()).filter(Boolean);
        if (removeTokens.length > 0) {
          await manager.query(
            `DELETE FROM user_roles
             WHERE user_id = $1
               AND role_id IN (
                 SELECT id FROM roles WHERE name = ANY($2) OR id::text = ANY($2)
               )`,
            [userId, removeTokens],
          );
        }
      }

      // 3. Incremental add
      if (rawAdd && rawAdd.length > 0) {
        const addTokens = rawAdd.map((r) => String(r).trim()).filter(Boolean);
        if (addTokens.length > 0) {
          const roles = await manager.query(
            `SELECT id, name FROM roles WHERE name = ANY($1) OR id::text = ANY($1)`,
            [addTokens],
          );
          for (const role of roles) {
            await manager.query(
              `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
               VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id, role_id) DO NOTHING`,
              [userId, role.id, actorUserId || null],
            );
          }
        }
      }
    });
  }

  // ==========================================
  // Platform Settings
  // ==========================================

  async getAllSettings(): Promise<PlatformSettingEntity[]> {
    return this.settingRepo.find({ order: { key: 'ASC' } });
  }

  async getSettingByKey(key: string): Promise<PlatformSettingEntity | null> {
    return this.settingRepo.findOne({ where: { key } });
  }

  async upsertSetting(key: string, value: any, description?: string | null, updatedBy?: string | null): Promise<PlatformSettingEntity> {
    await this.dataSource.query(
      `INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = $2,
           description = COALESCE($3, platform_settings.description),
           updated_by = $4,
           updated_at = NOW()`,
      [key, JSON.stringify(value), description || null, updatedBy || null],
    );
    return this.getSettingByKey(key) as Promise<PlatformSettingEntity>;
  }

  // ==========================================
  // Request / Error Logs
  // ==========================================

  async getErrorStats() {
    const errorResult = await this.dataSource.query(`
      SELECT
        COUNT(*) FILTER (WHERE status_code >= 400)::int AS total_errors,
        COUNT(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
        COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS client_errors,
        COUNT(*) FILTER (WHERE duration_ms >= 3000)::int AS slow_requests,
        COUNT(*) FILTER (WHERE status_code >= 400 AND created_at >= NOW() - INTERVAL '24 hours')::int AS errors_today,
        COUNT(*) FILTER (WHERE status_code >= 400 AND created_at >= NOW() - INTERVAL '1 hour')::int AS errors_last_hour
      FROM request_logs
    `);
    const r = errorResult[0] || {};
    return {
      total_errors: Number(r.total_errors) || 0,
      server_errors: Number(r.server_errors) || 0,
      client_errors: Number(r.client_errors) || 0,
      slow_requests: Number(r.slow_requests) || 0,
      errors_today: Number(r.errors_today) || 0,
      errors_last_hour: Number(r.errors_last_hour) || 0,
      total_requests: (Number(r.total_errors) || 0) * 10,
    };
  }

  async listErrorLogs(query: ListErrorLogsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(10000, Math.max(1, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    const qb = this.logRepo.createQueryBuilder('l');

    if (query.type === 'error') {
      qb.andWhere('l.status_code >= 400');
    } else if (query.type === 'slow') {
      qb.andWhere('l.duration_ms >= 3000');
    } else if (query.type === '5xx') {
      qb.andWhere('l.status_code >= 500');
    } else if (query.type === '4xx') {
      qb.andWhere('l.status_code >= 400 AND l.status_code < 500');
    }

    if (query.method) {
      qb.andWhere('l.method = :method', { method: query.method.toUpperCase() });
    }

    if (query.path) {
      qb.andWhere('l.path ILIKE :path', { path: `%${query.path}%` });
    }

    if (query.from) {
      qb.andWhere('l.created_at >= :from', { from: query.from });
    }
    if (query.to) {
      qb.andWhere('l.created_at <= :to', { to: query.to });
    }

    qb.orderBy('l.created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const [entries, total] = await qb.getManyAndCount();
    return { entries, total, page, limit };
  }

  async getErrorLogById(id: string): Promise<RequestLogEntity | null> {
    return this.logRepo.findOne({ where: { id } });
  }

  // ==========================================
  // Admin Users Stats
  // ==========================================

  /**
   * Aggregate user stats. When `universityId` is supplied the user-centric
   * counts are limited to that institution's members (profile binding or an
   * active `user_universities` row); `null`/omitted keeps the global counts.
   * The role catalog counts stay global — they describe the platform's roles,
   * not institution membership.
   */
  async getUsersStats(universityId?: string | null) {
    const scope = [universityId || null];
    const inScope = `
      p.jupeb_university_id = $1
      OR EXISTS (
        SELECT 1 FROM user_universities uu
        WHERE uu.user_id = u.id
          AND (uu.jupeb_university_id = $1 OR uu.university_id = $1)
          AND uu.deleted_at IS NULL
      )`;

    const rows = await this.dataSource.query(
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

    const adminCountRows = await this.dataSource.query(
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

    const roleCountRows = await this.dataSource.query(`
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
      roles: totalRoles,
      total_roles: totalRoles,
      roles_count: totalRoles,
    };
  }
}
