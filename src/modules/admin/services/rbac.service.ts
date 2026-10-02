import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { AdminRepository } from '../repositories/admin.repository';
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

@Injectable()
export class RbacService {
  private readonly logger;

  constructor(
    private readonly adminRepo: AdminRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(RbacService.name);
  }

  async listRoles(query: ListRbacQueryDto) {
    const res = await this.adminRepo.listRoles(query);
    const rolesWithPerms: RoleResponseDto[] = [];

    for (const r of res.roles) {
      const perms = await this.adminRepo.getRolePermissions(r.id);
      rolesWithPerms.push({
        id: r.id,
        name: r.name,
        display_name: r.displayName || null,
        description: r.description || null,
        is_system: r.isSystem,
        status: r.status,
        permissions: perms.map((p) => p.name),
        created_at: r.createdAt,
      });
    }

    return {
      success: true,
      message: 'Roles retrieved successfully',
      data: rolesWithPerms,
      roles: rolesWithPerms,
      total: res.total,
      page: res.page,
      limit: res.limit,
      pagination: {
        page: res.page,
        limit: res.limit,
        total: res.total,
      },
    };
  }

  async getRole(id: string): Promise<RoleResponseDto> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');

    const perms = await this.adminRepo.getRolePermissions(role.id);
    return {
      id: role.id,
      name: role.name,
      display_name: role.displayName || null,
      description: role.description || null,
      is_system: role.isSystem,
      status: role.status,
      permissions: perms.map((p) => p.name),
      created_at: role.createdAt,
    };
  }

  async createRole(dto: CreateRoleDto, userId?: string | null): Promise<RoleResponseDto> {
    const existing = await this.adminRepo.findRoleByName(dto.name);
    if (existing) throw new ConflictException(`Role with name "${dto.name}" already exists`);

    const role = await this.adminRepo.createRole({
      name: dto.name.trim(),
      displayName: dto.display_name || dto.name,
      description: dto.description || null,
      isSystem: false,
      status: 'active',
      createdBy: userId || null,
    });

    if (dto.permissions && dto.permissions.length) {
      for (const pName of dto.permissions) {
        const p = await this.adminRepo.findPermissionByName(pName);
        if (p) await this.adminRepo.attachPermissionToRole(role.id, p.id);
      }
    }

    return this.getRole(role.id);
  }

  async patchRole(id: string, dto: PatchRoleDto): Promise<RoleResponseDto> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');

    const updates: any = {};
    if (dto.display_name !== undefined) updates.displayName = dto.display_name;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.status !== undefined) updates.status = dto.status;

    await this.adminRepo.updateRole(id, updates);

    if (dto.permissions !== undefined && Array.isArray(dto.permissions)) {
      const currentPerms = await this.adminRepo.getRolePermissions(id);
      for (const cp of currentPerms) {
        await this.adminRepo.detachPermissionFromRole(id, cp.id);
      }
      for (const pName of dto.permissions) {
        const p = await this.adminRepo.findPermissionByName(pName);
        if (p) await this.adminRepo.attachPermissionToRole(id, p.id);
      }
    }

    return this.getRole(id);
  }

  async deleteRole(id: string): Promise<{ success: boolean }> {
    const role = await this.adminRepo.findRoleById(id);
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new UnprocessableEntityException('System roles cannot be deleted');

    await this.adminRepo.deleteRole(id);
    return { success: true };
  }

  async listRolePermissions(roleId: string) {
    const perms = await this.adminRepo.getRolePermissions(roleId);
    return perms.map((p) => ({
      id: p.id,
      name: p.name,
      module: p.module,
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

  async listPermissions(query: ListRbacQueryDto) {
    const res = await this.adminRepo.listPermissions(query);
    const permissions = res.permissions.map((p) => ({
      id: p.id,
      name: p.name,
      module: p.module,
      description: p.description,
      created_at: p.createdAt,
    }));
    return {
      success: true,
      message: 'Permissions retrieved successfully',
      data: permissions,
      permissions,
      total: res.total,
      page: res.page,
      limit: res.limit,
      pagination: {
        page: res.page,
        limit: res.limit,
        total: res.total,
      },
    };
  }

  async getPermission(id: string): Promise<PermissionResponseDto> {
    const p = await this.adminRepo.findPermissionById(id);
    if (!p) throw new NotFoundException('Permission not found');
    return {
      id: p.id,
      name: p.name,
      module: p.module,
      description: p.description,
      created_at: p.createdAt,
    };
  }

  async createPermission(dto: CreatePermissionDto): Promise<PermissionResponseDto> {
    const existing = await this.adminRepo.findPermissionByName(dto.name);
    if (existing) throw new ConflictException(`Permission "${dto.name}" already exists`);

    const p = await this.adminRepo.createPermission({
      name: dto.name.trim(),
      module: dto.module || 'general',
      description: dto.description || null,
    });

    return {
      id: p.id,
      name: p.name,
      module: p.module,
      description: p.description,
      created_at: p.createdAt,
    };
  }

  async patchPermission(id: string, dto: PatchPermissionDto): Promise<PermissionResponseDto> {
    const p = await this.adminRepo.findPermissionById(id);
    if (!p) throw new NotFoundException('Permission not found');

    const updates: any = {};
    if (dto.module !== undefined) updates.module = dto.module;
    if (dto.description !== undefined) updates.description = dto.description;

    const updated = await this.adminRepo.updatePermission(id, updates);
    return {
      id: updated!.id,
      name: updated!.name,
      module: updated!.module,
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
    await this.adminRepo.setUserRoles(userId, dto.roles, actorUserId);
    return this.adminRepo.getUserRoles(userId);
  }
}
