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

export const NON_REGISTRAR_ROLES = new Set([
  'super_admin',
  'admin',
  'jupeb_admin',
  'financial_admin',
  'agent',
  'student',
  'user',
  'operator',
]);

export const REGISTRAR_ALLOWED_SYSTEM_ROLES = [
  'institution_admin',
  'program_director',
  'registrar',
];

export const REGISTRAR_EXCLUDED_MODULES = new Set([
  'ocr',
  'posts',
  'general',
  'support',
  'institutions',
  'system',
]);

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
  'support.manage',
  'support.view',
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

export const INSTITUTION_EXCLUDED_PREFIXES = [
  'ocr.',
  'institutions.',
  'system.',
  'posts.',
  'support.',
  'profiles.',
];

export function isPermissionAllowedForInstitution(
  perm: string | { name: string; resource?: string | null },
): boolean {
  const permName = typeof perm === 'string' ? perm : perm?.name;
  if (!permName) return false;
  if (INSTITUTION_EXCLUDED_PERMISSIONS.has(permName)) return false;
  if (INSTITUTION_EXCLUDED_PREFIXES.some((prefix) => permName.startsWith(prefix))) {
    return false;
  }
  const modKey = getPermissionModule(typeof perm === 'string' ? { name: perm } : perm);
  if (REGISTRAR_EXCLUDED_MODULES.has(modKey)) {
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
    roles: string[];
    isSuperAdmin: boolean;
    isAdmin: boolean;
    isRegistrar: boolean;
    isInstitutionUser: boolean;
    universityId: string | null;
  }> {
    if (!user) {
      return {
        userId: null,
        roles: [],
        isSuperAdmin: false,
        isAdmin: false,
        isRegistrar: false,
        isInstitutionUser: false,
        universityId: null,
      };
    }
    const userId = user.user_id || user.id || null;
    if (!userId) {
      return {
        userId: null,
        roles: [],
        isSuperAdmin: false,
        isAdmin: false,
        isRegistrar: false,
        isInstitutionUser: false,
        universityId: null,
      };
    }

    const roles = await this.scopeService.getUserRoles(userId);
    const isSuperAdmin = roles.includes('super_admin');
    const isAdmin = roles.includes('admin') || isSuperAdmin;
    const isRegistrar = roles.includes('registrar');
    const isInstitutionAdmin = roles.includes('institution_admin');
    const isProgramDirector = roles.includes('program_director');
    const universityId = await this.scopeService.getProfileJupebUniversityId(userId);

    const isInstitutionUser =
      !isSuperAdmin &&
      (isInstitutionAdmin ||
        isProgramDirector ||
        isRegistrar ||
        (Boolean(universityId) && !roles.includes('admin')));

    return {
      userId,
      roles,
      isSuperAdmin,
      isAdmin,
      isRegistrar,
      isInstitutionUser,
      universityId,
    };
  }

  isRegistrarRequest(query: ListRbacQueryDto, req?: any, ctx?: any): boolean {
    const portal = (query?.portal || query?.scope || '').toLowerCase().trim();
    if (portal === 'registrar' || portal === 'institution') return true;
    if (query?.is_institution === true || (query?.is_institution as any) === 'true') return true;

    const targetRole = (query?.role || query?.role_name || '').toLowerCase().trim();
    if (
      targetRole === 'registrar' ||
      targetRole === 'institution_admin' ||
      targetRole === 'program_director'
    ) {
      return true;
    }

    if (ctx?.isRegistrar) return true;

    if (req?.headers) {
      const xPortal = (req.headers['x-portal'] || '').toString().toLowerCase();
      if (xPortal === 'registrar' || xPortal === 'institution') return true;
      const origin = (req.headers['origin'] || '').toString().toLowerCase();
      const referer = (req.headers['referer'] || '').toString().toLowerCase();
      if (origin.includes('registrar') || referer.includes('registrar')) return true;
    }

    return false;
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

  async listRoles(query: ListRbacQueryDto, user?: any, req?: any) {
    const ctx = await this.getEffectiveCallerContext(user);
    const isRegistrar = this.isRegistrarRequest(query, req, ctx);
    const targetRole = (query.role || query.role_name || '').toLowerCase().trim();

    const isInstitutionScope =
      ctx.isInstitutionUser ||
      ctx.isRegistrar ||
      Boolean(ctx.universityId) ||
      isRegistrar;

    let allowedSystemRoles: string[] | undefined = undefined;
    if (isInstitutionScope) {
      if (ctx.isRegistrar || targetRole === 'registrar') {
        allowedSystemRoles = ['registrar'];
      } else if (ctx.roles?.includes('institution_admin') || targetRole === 'institution_admin') {
        allowedSystemRoles = ['institution_admin'];
      } else if (ctx.roles?.includes('program_director') || targetRole === 'program_director') {
        allowedSystemRoles = ['program_director'];
      } else {
        allowedSystemRoles = REGISTRAR_ALLOWED_SYSTEM_ROLES;
      }
    }

    const res = await this.adminRepo.listRoles(
      query,
      ctx.universityId,
      isInstitutionScope,
      allowedSystemRoles,
    );
    const rolesWithPerms: RoleResponseDto[] = [];

    for (const r of res.roles) {
      if (isInstitutionScope && NON_REGISTRAR_ROLES.has((r.name || '').toLowerCase().trim())) {
        continue;
      }
      const perms = await this.adminRepo.getRolePermissions(r.id);
      const filteredPerms = isInstitutionScope
        ? perms.filter((p) => isPermissionAllowedForInstitution(p))
        : perms;
      rolesWithPerms.push(this.formatRole(r, filteredPerms));
    }

    const totalPages = Math.ceil(rolesWithPerms.length / (res.limit || 20)) || 1;

    return {
      success: true,
      message: 'Roles retrieved successfully',
      data: rolesWithPerms,
      roles: rolesWithPerms,
      total: rolesWithPerms.length,
      page: res.page,
      limit: res.limit,
      total_pages: totalPages,
      totalPages,
      pagination: {
        page: res.page,
        limit: res.limit,
        total: rolesWithPerms.length,
        totalPages,
        total_pages: totalPages,
      },
    };
  }

  async getRole(id: string, user?: any, req?: any): Promise<RoleResponseDto> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');

    const ctx = await this.getEffectiveCallerContext(user);
    const isRegistrar = this.isRegistrarRequest({}, req, ctx);
    const isInstitutionScope =
      ctx.isInstitutionUser ||
      ctx.isRegistrar ||
      Boolean(ctx.universityId) ||
      isRegistrar;

    if (isInstitutionScope) {
      if (role.isSystem) {
        if (!REGISTRAR_ALLOWED_SYSTEM_ROLES.includes(role.name)) {
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
    const filteredPerms = isInstitutionScope
      ? perms.filter((p) => isPermissionAllowedForInstitution(p))
      : perms;
    return this.formatRole(role, filteredPerms);
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

  async listRolePermissions(roleId: string, req?: any, user?: any) {
    const ctx = await this.getEffectiveCallerContext(user);
    const isRegistrar = this.isRegistrarRequest({}, req, ctx);
    const isInstitutionScope =
      ctx.isInstitutionUser ||
      ctx.isRegistrar ||
      Boolean(ctx.universityId) ||
      isRegistrar;

    let perms = await this.adminRepo.getRolePermissions(roleId);
    if (isInstitutionScope) {
      perms = perms.filter((p) => isPermissionAllowedForInstitution(p));
    }
    return perms.map((p) => ({
      id: p.id,
      name: p.name,
      module: p.resource || (p.name ? p.name.split('.')[0] : 'general'),
      description: p.description,
    }));
  }

  async attachPermission(roleId: string, permissionId: string, user?: any, req?: any) {
    const role = await this.adminRepo.findRoleById(roleId);
    if (!role) throw new NotFoundException('Role not found');
    const perm = await this.adminRepo.findPermissionById(permissionId);
    if (!perm) throw new NotFoundException('Permission not found');

    const ctx = await this.getEffectiveCallerContext(user);
    const isRegistrar = this.isRegistrarRequest({}, req, ctx);
    if (ctx.isInstitutionUser || isRegistrar) {
      if (!isPermissionAllowedForInstitution(perm)) {
        throw new ForbiddenException('This permission is not available for institution roles');
      }
    }

    await this.adminRepo.attachPermissionToRole(roleId, permissionId);
    return { success: true, message: 'Permission attached to role' };
  }

  async detachPermission(roleId: string, permissionId: string) {
    await this.adminRepo.detachPermissionFromRole(roleId, permissionId);
    return { success: true, message: 'Permission detached from role' };
  }

  async listPermissions(query: ListRbacQueryDto, user?: any, req?: any) {
    const ctx = await this.getEffectiveCallerContext(user);
    const targetRole = (query.role || query.role_name || '').toLowerCase().trim();
    const isRegistrar = this.isRegistrarRequest(query, req, ctx);

    const filterForInstitution =
      ctx.isInstitutionUser ||
      ctx.isRegistrar ||
      Boolean(ctx.universityId) ||
      isRegistrar ||
      targetRole === 'institution_admin' ||
      targetRole === 'program_director' ||
      targetRole === 'registrar' ||
      (targetRole !== '' && !NON_REGISTRAR_ROLES.has(targetRole));

    if (query.group_by === 'role') {
      let allowedSystemRoles: string[] | undefined = undefined;
      if (filterForInstitution) {
        if (ctx.isRegistrar || targetRole === 'registrar') {
          allowedSystemRoles = ['registrar'];
        } else if (ctx.roles?.includes('institution_admin') || targetRole === 'institution_admin') {
          allowedSystemRoles = ['institution_admin'];
        } else if (ctx.roles?.includes('program_director') || targetRole === 'program_director') {
          allowedSystemRoles = ['program_director'];
        } else {
          allowedSystemRoles = REGISTRAR_ALLOWED_SYSTEM_ROLES;
        }
      }

      const groups = await this.adminRepo.listPermissionsGroupedByRole(
        query,
        ctx.universityId,
        filterForInstitution,
        allowedSystemRoles,
      );

      let filteredGroups = groups;
      if (filterForInstitution) {
        filteredGroups = groups.filter((g: any) => {
          const roleName = (g.role_name || '').toLowerCase().trim();
          if (NON_REGISTRAR_ROLES.has(roleName)) return false;
          return true;
        });
        for (const g of filteredGroups) {
          g.permissions = (g.permissions || []).filter((p: any) =>
            isPermissionAllowedForInstitution(p),
          );
        }
      }
      return {
        success: true,
        message: 'Permissions grouped by role retrieved successfully',
        data: filteredGroups,
        roles: filteredGroups,
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
      filtered = filtered.filter((p) => isPermissionAllowedForInstitution(p));
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
