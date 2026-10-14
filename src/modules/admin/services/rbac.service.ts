import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  ForbiddenException,
} from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { AdminRepository } from '../repositories/admin.repository';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';
import {
  CreateRoleDto,
  PatchRoleDto,
  CreatePermissionDto,
  PatchPermissionDto,
  SetUserRolesDto,
  ListRbacQueryDto,
  RoleResponseDto,
  PermissionResponseDto,
} from '../dto';

export const MODULE_METADATA: Record<
  string,
  { name: string; description: string; order: number }
> = {
  candidate: {
    name: 'Candidate Management',
    description: 'Manage candidate registrations, biodata, and records',
    order: 1,
  },
  jupeb: {
    name: 'Academic & Registration',
    description: 'Manage JUPEB academic courses, registration workflows, and student identity verification',
    order: 2,
  },
  support: {
    name: 'Support & Inquiries',
    description: 'Manage support tickets, assignments, replies, and status',
    order: 3,
  },
  results: {
    name: 'Examination Results',
    description: 'View, release, and distribute examination results',
    order: 4,
  },
  reports: {
    name: 'Reports & Analytics',
    description: 'Generate, export, and view session reports and analytics',
    order: 5,
  },
  payments: {
    name: 'Finance & Payments',
    description: 'Initiate and manage session fees and payment transactions',
    order: 6,
  },
  users: {
    name: 'User Management',
    description: 'Manage system users, administrative staff, and credentials',
    order: 7,
  },
  roles: {
    name: 'Roles & Permissions',
    description: 'Configure custom roles and manage permission assignments',
    order: 8,
  },
  sessions: {
    name: 'Academic Sessions',
    description: 'Manage academic calendars, registration windows, and terms',
    order: 9,
  },
  subject_combinations: {
    name: 'Subject Combinations',
    description: 'View curriculum subjects and approved subject combinations',
    order: 10,
  },
  audit: {
    name: 'Audit Trail & Logs',
    description: 'Review system audit trail logs and activity history',
    order: 11,
  },
  institutions: {
    name: 'Institution Management',
    description: 'Central management of institutions and universities',
    order: 12,
  },
  ocr: {
    name: 'OCR Processing',
    description: 'OCR document extraction and manual transcription',
    order: 13,
  },
  system: {
    name: 'System Administration',
    description: 'System configuration, server logs, and maintenance',
    order: 14,
  },
  posts: {
    name: 'Content & Announcements',
    description: 'Manage announcements, bulletins, and posts',
    order: 15,
  },
  general: {
    name: 'General',
    description: 'General system permissions',
    order: 99,
  },
};

export const INSTITUTION_EXCLUDED_PERMISSIONS = new Set([
  'ocr.create',
  'ocr.manual_entry',
  'ocr.read',
  'ocr.read.any',
  'ocr.requirement.bind',
  'institutions.create',
  'institutions.delete',
  'institutions.update',
  'institutions.view',
  'system.admin',
  'system.config',
  'system.logs',
  'posts.manage',
  'profiles.jupeb_university_id',
  'jupeb.catalog.manage',
  'jupeb.finance.manage',
  'jupeb.submission.manage',
  'jupeb.student.access',
  'payments.manage',
  'subject_combinations.create',
  'subject_combinations.delete',
  'subject_combinations.update',
  'subject.create',
  'subject.delete',
  'subject.update',
]);

export const INSTITUTION_EXCLUDED_PREFIXES = ['ocr.', 'institutions.', 'system.', 'posts.'];

export function isPermissionAllowedForInstitution(permName: string): boolean {
  if (!permName) return false;
  if (INSTITUTION_EXCLUDED_PERMISSIONS.has(permName)) return false;
  if (INSTITUTION_EXCLUDED_PREFIXES.some((prefix) => permName.startsWith(prefix))) {
    return false;
  }
  return true;
}

export function getPermissionModule(p: { name: string; resource?: string | null }): string {
  const permName = (p.name || '').trim();
  const resource = (p.resource || '').toLowerCase().trim();

  if (permName === 'generate.report' || permName.startsWith('reports.')) {
    return 'reports';
  }
  if (permName === 'send.result' || permName.startsWith('results.')) {
    return 'results';
  }
  if (permName.startsWith('activity_logs.') || permName.startsWith('audit.')) {
    return 'audit';
  }
  if (permName.startsWith('permissions.') || permName.startsWith('roles.')) {
    return 'roles';
  }
  if (permName.startsWith('subject.') || permName.startsWith('subject_combinations.')) {
    return 'subject_combinations';
  }
  if (permName.startsWith('candidate.')) {
    return 'candidate';
  }
  if (permName.startsWith('jupeb.')) {
    return 'jupeb';
  }
  if (permName.startsWith('support.')) {
    return 'support';
  }
  if (permName.startsWith('payments.')) {
    return 'payments';
  }
  if (permName.startsWith('users.')) {
    return 'users';
  }
  if (permName.startsWith('sessions.')) {
    return 'sessions';
  }
  if (permName.startsWith('institutions.')) {
    return 'institutions';
  }
  if (permName.startsWith('ocr.')) {
    return 'ocr';
  }
  if (permName.startsWith('system.')) {
    return 'system';
  }
  if (permName.startsWith('posts.')) {
    return 'posts';
  }

  if (resource && MODULE_METADATA[resource]) {
    return resource;
  }
  if (permName.includes('.')) {
    const prefix = permName.split('.')[0].toLowerCase();
    if (MODULE_METADATA[prefix]) return prefix;
  }
  return 'general';
}

export function groupPermissionsByModule(permissions: any[]) {
  const groupsMap = new Map<string, any[]>();

  for (const perm of permissions) {
    const modKey = getPermissionModule(perm);
    if (!groupsMap.has(modKey)) {
      groupsMap.set(modKey, []);
    }
    const permName = perm.name || '';
    const action =
      perm.action ||
      (permName.includes('.') ? permName.split('.').slice(1).join('.') : null);
    groupsMap.get(modKey)!.push({
      id: perm.id,
      name: permName,
      display_name: perm.description || permName,
      description: perm.description || null,
      module: modKey,
      resource: perm.resource || modKey,
      action,
      created_at: perm.createdAt || perm.created_at,
    });
  }

  const moduleGroups = [];
  for (const [modKey, perms] of groupsMap.entries()) {
    const meta = MODULE_METADATA[modKey] || {
      name: modKey.charAt(0).toUpperCase() + modKey.slice(1),
      description: `${modKey} permissions`,
      order: 100,
    };
    moduleGroups.push({
      module: modKey,
      module_name: meta.name,
      description: meta.description,
      order: meta.order,
      total_permissions: perms.length,
      permissions: perms,
    });
  }

  moduleGroups.sort((a, b) => a.order - b.order);
  return moduleGroups;
}

@Injectable()
export class RbacService {
  private readonly logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly scopeService: InstitutionUserScopeService,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(RbacService.name);
  }

  async getEffectiveCallerContext(user?: any): Promise<{
    userId: string | null;
    isSuperAdmin: boolean;
    isAdmin: boolean;
    isInstitutionUser: boolean;
    universityId: string | null;
  }> {
    if (!user) {
      return {
        userId: null,
        isSuperAdmin: false,
        isAdmin: false,
        isInstitutionUser: false,
        universityId: null,
      };
    }
    const userId = user.user_id || user.id || null;
    if (!userId) {
      return {
        userId: null,
        isSuperAdmin: false,
        isAdmin: false,
        isInstitutionUser: false,
        universityId: null,
      };
    }

    const roles = await this.scopeService.getUserRoles(userId);
    const isSuperAdmin = roles.includes('super_admin');
    const isAdmin = roles.includes('admin') || isSuperAdmin;
    const universityId = await this.scopeService.getProfileJupebUniversityId(userId);

    const isInstitutionUser =
      !isSuperAdmin &&
      (roles.includes('institution_admin') ||
        roles.includes('program_director') ||
        (Boolean(universityId) && !roles.includes('admin')));

    return {
      userId,
      isSuperAdmin,
      isAdmin,
      isInstitutionUser,
      universityId,
    };
  }

  private formatRole(role: any, perms: any[]): RoleResponseDto {
    const permissionObjects = perms.map((p) => ({
      id: p.id,
      name: p.name,
      display_name: p.description || p.name,
      module: p.resource || (p.name ? p.name.split('.')[0] : 'general'),
      description: p.description || null,
      created_at: p.createdAt || p.created_at,
    }));

    return {
      id: role.id,
      name: role.name,
      display_name: role.displayName || role.display_name || null,
      description: role.description || null,
      is_system: role.isSystem ?? role.is_system ?? false,
      owner_jupeb_university_id: role.ownerJupebUniversityId || role.owner_jupeb_university_id || null,
      status: role.status,
      permissions: permissionObjects,
      permission_names: perms.map((p) => p.name),
      permission_ids: perms.map((p) => p.id),
      created_at: role.createdAt || role.created_at,
      updated_at: role.updatedAt || role.updated_at || role.createdAt || role.created_at,
    };
  }

  async listRoles(query: ListRbacQueryDto, user?: any) {
    const ctx = await this.getEffectiveCallerContext(user);
    const res = await this.adminRepo.listRoles(
      query,
      ctx.universityId,
      ctx.isInstitutionUser,
    );
    const rolesWithPerms: RoleResponseDto[] = [];

    for (const r of res.roles) {
      const perms = await this.adminRepo.getRolePermissions(r.id);
      rolesWithPerms.push(this.formatRole(r, perms));
    }

    const totalPages = Math.ceil(res.total / (res.limit || 20)) || 1;

    return {
      success: true,
      message: 'Roles retrieved successfully',
      data: rolesWithPerms,
      roles: rolesWithPerms,
      total: res.total,
      page: res.page,
      limit: res.limit,
      total_pages: totalPages,
      totalPages,
      pagination: {
        page: res.page,
        limit: res.limit,
        total: res.total,
        totalPages,
        total_pages: totalPages,
      },
    };
  }

  async getRole(id: string, user?: any): Promise<RoleResponseDto> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');

    const ctx = await this.getEffectiveCallerContext(user);
    if (ctx.isInstitutionUser) {
      if (role.isSystem) {
        if (role.name !== 'institution_admin' && role.name !== 'program_director') {
          throw new ForbiddenException('You do not have access to this role');
        }
      } else {
        if (
          !role.ownerJupebUniversityId ||
          String(role.ownerJupebUniversityId) !== String(ctx.universityId)
        ) {
          throw new ForbiddenException('You do not have access to this role');
        }
      }
    }

    const perms = await this.adminRepo.getRolePermissions(role.id);
    return this.formatRole(role, perms);
  }

  private async resolvePermission(identifier: any) {
    if (!identifier) return null;
    let val = identifier;
    if (typeof identifier === 'object') {
      val = identifier.id || identifier.name || identifier.permission_id;
    }
    if (!val || typeof val !== 'string') return null;
    val = val.trim();

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    if (isUuid) {
      const byId = await this.adminRepo.findPermissionById(val);
      if (byId) return byId;
    }
    const byName = await this.adminRepo.findPermissionByName(val);
    if (byName) return byName;

    const rows = await (this.adminRepo as any).dataSource.query(
      `SELECT * FROM permissions WHERE id::text = $1 OR name = $1 OR name ILIKE $1 LIMIT 1`,
      [val],
    );
    return rows[0] || null;
  }

  async createRole(dto: CreateRoleDto, user?: any): Promise<RoleResponseDto> {
    const ctx = await this.getEffectiveCallerContext(user);
    const roleName = dto.name.trim();

    if (ctx.isInstitutionUser && ctx.universityId) {
      const existing = await this.adminRepo.findRoleByNameAndUniversity(
        roleName,
        ctx.universityId,
      );
      if (existing) {
        throw new ConflictException(
          `Role with name "${roleName}" already exists for your institution`,
        );
      }

      const role = await this.adminRepo.createRole({
        name: roleName,
        displayName: dto.display_name || roleName,
        description: dto.description || null,
        isSystem: false,
        status: 'active',
        createdBy: ctx.userId || null,
        ownerJupebUniversityId: ctx.universityId,
      });

      if (dto.permissions && dto.permissions.length) {
        for (const pItem of dto.permissions) {
          const p = await this.resolvePermission(pItem);
          if (p) await this.adminRepo.attachPermissionToRole(role.id, p.id);
        }
      }

      return this.getRole(role.id, user);
    }

    const existing = await this.adminRepo.findRoleByName(roleName);
    if (existing) {
      if (existing.isSystem) {
        throw new ConflictException(
          `Role with name "${roleName}" is a system role and already exists. To assign it to users, use POST /admin/users with role="${roleName}".`,
        );
      }
      throw new ConflictException(`Role with name "${roleName}" already exists`);
    }

    const role = await this.adminRepo.createRole({
      name: roleName,
      displayName: dto.display_name || roleName,
      description: dto.description || null,
      isSystem: false,
      status: 'active',
      createdBy: ctx.userId || null,
      ownerJupebUniversityId: null,
    });

    if (dto.permissions && dto.permissions.length) {
      for (const pItem of dto.permissions) {
        const p = await this.resolvePermission(pItem);
        if (p) await this.adminRepo.attachPermissionToRole(role.id, p.id);
      }
    }

    return this.getRole(role.id, user);
  }

  async patchRole(id: string, dto: PatchRoleDto, user?: any): Promise<RoleResponseDto> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');

    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw new UnprocessableEntityException('System role names cannot be modified');
    }

    const ctx = await this.getEffectiveCallerContext(user);
    if (ctx.isInstitutionUser) {
      if (role.isSystem) {
        throw new ForbiddenException('Cannot modify system roles');
      }
      if (
        role.ownerJupebUniversityId &&
        String(role.ownerJupebUniversityId) !== String(ctx.universityId)
      ) {
        throw new ForbiddenException('Role is outside your institution scope');
      }
    }

    const updates: any = {};
    if (dto.name !== undefined && !role.isSystem) updates.name = dto.name.trim();
    if (dto.display_name !== undefined) updates.displayName = dto.display_name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.status !== undefined) updates.status = dto.status;

    if (Object.keys(updates).length > 0) {
      await this.adminRepo.updateRole(id, updates);
    }

    if (dto.permissions !== undefined && Array.isArray(dto.permissions)) {
      const currentPerms = await this.adminRepo.getRolePermissions(id);
      for (const cp of currentPerms) {
        await this.adminRepo.detachPermissionFromRole(id, cp.id);
      }
      for (const pItem of dto.permissions) {
        const p = await this.resolvePermission(pItem);
        if (p) await this.adminRepo.attachPermissionToRole(id, p.id);
      }
    }

    return this.getRole(id, user);
  }

  async deleteRole(id: string, user?: any): Promise<{ success: boolean }> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new UnprocessableEntityException('System roles cannot be deleted');

    const ctx = await this.getEffectiveCallerContext(user);
    if (
      ctx.isInstitutionUser &&
      role.ownerJupebUniversityId &&
      String(role.ownerJupebUniversityId) !== String(ctx.universityId)
    ) {
      throw new ForbiddenException('Role is outside your institution scope');
    }

    await this.adminRepo.deleteRole(id);
    return { success: true };
  }

  async listRolePermissions(roleId: string) {
    const perms = await this.adminRepo.getRolePermissions(roleId);
    return perms.map((p) => ({
      id: p.id,
      name: p.name,
      module: p.resource || (p.name ? p.name.split('.')[0] : 'general'),
      description: p.description,
    }));
  }

  async attachPermission(roleId: string, permissionId: string) {
    await this.adminRepo.attachPermissionToRole(roleId, permissionId);
    return { success: true, message: 'Permission attached to role' };
  }

  async detachPermission(roleId: string, permissionId: string) {
    await this.adminRepo.detachPermissionFromRole(roleId, permissionId);
    return { success: true, message: 'Permission detached from role' };
  }

  async listPermissions(query: ListRbacQueryDto, user?: any) {
    const ctx = await this.getEffectiveCallerContext(user);
    const targetRole = (query.role || query.role_name || '').toLowerCase().trim();
    const filterForInstitution =
      ctx.isInstitutionUser ||
      targetRole === 'institution_admin' ||
      targetRole === 'program_director';

    if (query.group_by === 'role') {
      const groups = await this.adminRepo.listPermissionsGroupedByRole(
        query,
        ctx.universityId,
        ctx.isInstitutionUser,
      );
      if (filterForInstitution) {
        for (const g of groups) {
          g.permissions = (g.permissions || []).filter((p: any) =>
            isPermissionAllowedForInstitution(p.name),
          );
        }
      }
      return {
        success: true,
        message: 'Permissions grouped by role retrieved successfully',
        data: groups,
        roles: groups,
      };
    }

    // Use a large limit for listing permissions so we can group all relevant ones by module
    const queryForPermissions = {
      ...query,
      limit: query.limit ? Math.max(1000, Number(query.limit) || 1000) : 1000,
    };
    const res = await this.adminRepo.listPermissions(queryForPermissions);

    let filtered = res.permissions;
    if (filterForInstitution) {
      filtered = filtered.filter((p) => isPermissionAllowedForInstitution(p.name));
    }

    const permissions = filtered.map((p) => {
      const modKey = getPermissionModule(p);
      return {
        id: p.id,
        name: p.name,
        display_name: p.description || p.name,
        description: p.description || null,
        module: modKey,
        resource: p.resource || modKey,
        action: p.action || (p.name.includes('.') ? p.name.split('.').slice(1).join('.') : null),
        created_at: p.createdAt,
      };
    });

    if (query.group_by === 'flat') {
      return {
        success: true,
        message: 'Permissions retrieved successfully',
        data: permissions,
        permissions,
        total: permissions.length,
        page: Number(query.page) || 1,
        limit: Number(query.limit) || permissions.length,
        pagination: {
          page: Number(query.page) || 1,
          limit: Number(query.limit) || permissions.length,
          total: permissions.length,
        },
      };
    }

    // Default & group_by === 'module': group by module
    const moduleGroups = groupPermissionsByModule(filtered);

    return {
      success: true,
      message: 'Permissions retrieved successfully',
      data: moduleGroups,
      modules: moduleGroups,
      grouped: moduleGroups,
      permissions,
      total: permissions.length,
      total_modules: moduleGroups.length,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || permissions.length,
      pagination: {
        page: Number(query.page) || 1,
        limit: Number(query.limit) || permissions.length,
        total: permissions.length,
        total_modules: moduleGroups.length,
      },
    };
  }

  async getPermission(id: string): Promise<PermissionResponseDto> {
    const p = await this.adminRepo.findPermissionById(id);
    if (!p) throw new NotFoundException('Permission not found');

    const resource =
      p.resource ||
      (p.name.includes(':')
        ? p.name.split(':')[0]
        : p.name.includes('.')
        ? p.name.split('.')[0]
        : 'general');
    const action =
      p.action ||
      (p.name.includes(':')
        ? p.name.split(':')[1]
        : p.name.includes('.')
        ? p.name.split('.')[1]
        : null);

    return {
      id: p.id,
      name: p.name,
      resource,
      action,
      module: resource,
      description: p.description,
      created_at: p.createdAt,
    };
  }

  async createPermission(dto: CreatePermissionDto): Promise<PermissionResponseDto> {
    const rawName = (
      dto.name ||
      (dto.resource && dto.action ? `${dto.resource}:${dto.action}` : '')
    ).trim();

    if (!rawName) {
      throw new UnprocessableEntityException('Permission name or resource+action is required');
    }

    const existing = await this.adminRepo.findPermissionByName(rawName);
    if (existing) throw new ConflictException(`Permission "${rawName}" already exists`);

    const resource =
      dto.resource ||
      dto.module ||
      (rawName.includes(':')
        ? rawName.split(':')[0]
        : rawName.includes('.')
        ? rawName.split('.')[0]
        : 'general');
    const action =
      dto.action ||
      (rawName.includes(':')
        ? rawName.split(':')[1]
        : rawName.includes('.')
        ? rawName.split('.')[1]
        : null);

    const p = await this.adminRepo.createPermission({
      name: rawName,
      resource,
      action,
      description: dto.description || null,
    });

    return {
      id: p.id,
      name: p.name,
      resource: p.resource || resource,
      action: p.action || action,
      module: p.resource || resource,
      description: p.description,
      created_at: p.createdAt,
    };
  }

  async patchPermission(id: string, dto: PatchPermissionDto): Promise<PermissionResponseDto> {
    const p = await this.adminRepo.findPermissionById(id);
    if (!p) throw new NotFoundException('Permission not found');

    const updates: any = {};
    if (dto.module !== undefined) updates.resource = dto.module;
    if (dto.description !== undefined) updates.description = dto.description;

    const updated = await this.adminRepo.updatePermission(id, updates);
    return {
      id: updated!.id,
      name: updated!.name,
      module: updated!.resource || (updated!.name ? updated!.name.split('.')[0] : 'general'),
      description: updated!.description,
      created_at: updated!.createdAt,
    };
  }

  async deletePermission(id: string): Promise<{ success: boolean }> {
    const p = await this.adminRepo.findPermissionById(id);
    if (!p) throw new NotFoundException('Permission not found');

    await this.adminRepo.deletePermission(id);
    return { success: true };
  }

  async listUserRoles(userId: string) {
    return this.adminRepo.getUserRoles(userId);
  }

  async setUserRoles(userId: string, dto: SetUserRolesDto, actorUserId?: string | null) {
    const roles = dto.roles;
    const roleIds = dto.role_ids || dto.roleIds;
    const add = dto.add || dto.add_roles || dto.add_role_ids;
    const remove = dto.remove || dto.remove_roles || dto.remove_role_ids;

    await this.adminRepo.setUserRoles(
      userId,
      {
        roles,
        roleIds,
        add,
        remove,
      },
      actorUserId,
    );

    const userRoles = await this.adminRepo.getUserRoles(userId);
    return {
      success: true,
      message: 'User roles updated successfully',
      data: userRoles,
      roles: userRoles,
      role_names: userRoles.map((r) => r.name),
      role_ids: userRoles.map((r) => r.id),
    };
  }
}
