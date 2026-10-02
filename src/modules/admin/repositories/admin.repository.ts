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
      qb.andWhere('(r.name ILIKE :q OR r.display_name ILIKE :q OR r.description ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    if (query.status) {
      qb.andWhere('r.status = :status', { status: query.status });
    }
    if (query.is_system !== undefined) {
      qb.andWhere('r.is_system = :is_system', { is_system: query.is_system });
    }

    qb.orderBy('r.is_system', 'DESC')
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
    if (query.module) {
      qb.andWhere('p.module = :module', { module: query.module });
    }

    qb.orderBy('p.module', 'ASC')
      .addOrderBy('p.name', 'ASC')
      .limit(limit)
      .offset(offset);

    const [permissions, total] = await qb.getManyAndCount();
    return { permissions, total, page, limit };
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

  async setUserRoles(userId: string, roleNames: string[], actorUserId?: string | null): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      if (!roleNames.length) return;

      const roles = await manager.query(
        `SELECT id, name FROM roles WHERE name = ANY($1)`,
        [roleNames],
      );

      for (const role of roles) {
        await manager.query(
          `INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at)
           VALUES ($1, $2, $3, NOW()) ON CONFLICT (user_id, role_id) DO NOTHING`,
          [userId, role.id, actorUserId || null],
        );
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

  async getUsersStats() {
    const rows = await this.dataSource.query(`
      SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_users,
        COUNT(*) FILTER (WHERE status <> 'active')::int AS inactive_users,
        COUNT(*) FILTER (WHERE email_verified = true)::int AS verified_emails
      FROM users
      WHERE deleted_at IS NULL
    `);

    const adminCountRows = await this.dataSource.query(`
      SELECT COUNT(DISTINCT ur.user_id)::int AS count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name IN ('institution_admin', 'admin', 'super_admin')
    `);

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
