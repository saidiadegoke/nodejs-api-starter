import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard, Audit } from '../../../utils';
import { RbacService } from '../services/rbac.service';
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

@ApiTags('Admin RBAC')
@Controller(['admin', ''])
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // ── Roles ──────────────────────────────────────────────────────────────

  @Get('roles')
  @ApiOperation({ summary: 'List roles', description: 'Paginated list of roles with optional search and status filter.' })
  async listRoles(@Query() query: ListRbacQueryDto) {
    return this.rbacService.listRoles(query);
  }

  @Post('roles')
  @Audit('role.create', { resourceType: 'role', resourceId: 'result:id', details: 'body' })
  @ApiOperation({ summary: 'Create a role', description: 'Creates a new custom role and optionally attaches permissions.' })
  @ApiCreatedResponse({ type: RoleResponseDto })
  async createRole(@Body() dto: CreateRoleDto, @Req() req: any) {
    const role = await this.rbacService.createRole(dto, req.user?.user_id);
    return {
      success: true,
      message: 'Role created successfully',
      data: role,
      ...role,
    };
  }

  @Get('roles/:roleId')
  @ApiOperation({ summary: 'Get role by ID', description: 'Returns a single role with its attached permission names.' })
  @ApiOkResponse({ type: RoleResponseDto })
  async getRole(@Param('roleId') roleId: string) {
    const role = await this.rbacService.getRole(roleId);
    return {
      success: true,
      message: 'Role retrieved successfully',
      data: role,
      ...role,
    };
  }

  @Patch('roles/:roleId')
  @Audit('role.update', {
    resourceType: 'role',
    resourceId: 'params:roleId',
    details: 'body',
  })
  @ApiOperation({ summary: 'Patch role', description: 'Updates display_name, description, status, or replaces permission set.' })
  @ApiOkResponse({ type: RoleResponseDto })
  async patchRole(@Param('roleId') roleId: string, @Body() dto: PatchRoleDto) {
    const role = await this.rbacService.patchRole(roleId, dto);
    return {
      success: true,
      message: 'Role updated successfully',
      data: role,
      ...role,
    };
  }

  @Delete('roles/:roleId')
  @Audit('role.delete', {
    resourceType: 'role',
    resourceId: 'params:roleId',
    durable: true,
  })
  @ApiOperation({ summary: 'Delete role', description: 'Deletes a non-system role permanently.' })
  async deleteRole(@Param('roleId') roleId: string) {
    return this.rbacService.deleteRole(roleId);
  }

  // ── Role Permissions ───────────────────────────────────────────────────

  @Get('roles/:roleId/permissions')
  @ApiOperation({ summary: 'List role permissions', description: 'Returns all permissions attached to a role.' })
  async listRolePermissions(@Param('roleId') roleId: string) {
    return this.rbacService.listRolePermissions(roleId);
  }

  @Post('roles/:roleId/permissions/:permissionId')
  @Audit('role.permission_attach', {
    resourceType: 'role',
    resourceId: 'params:roleId',
    details: ({ req }) => ({ permission_id: req.params?.permissionId }),
  })
  @ApiOperation({ summary: 'Attach permission to role' })
  async attachPermission(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.rbacService.attachPermission(roleId, permissionId);
  }

  @Delete('roles/:roleId/permissions/:permissionId')
  @Audit('role.permission_detach', {
    resourceType: 'role',
    resourceId: 'params:roleId',
    details: ({ req }) => ({ permission_id: req.params?.permissionId }),
  })
  @ApiOperation({ summary: 'Detach permission from role' })
  async detachPermission(
    @Param('roleId') roleId: string,
    @Param('permissionId') permissionId: string,
  ) {
    return this.rbacService.detachPermission(roleId, permissionId);
  }

  // ── Permissions ────────────────────────────────────────────────────────

  @Get('permissions')
  @ApiOperation({ summary: 'List permissions', description: 'Paginated list of permissions with search and module filter.' })
  async listPermissions(@Query() query: ListRbacQueryDto) {
    return this.rbacService.listPermissions(query);
  }

  @Post('permissions')
  @Audit('permission.create', { resourceType: 'permission', resourceId: 'result:id', details: 'body' })
  @ApiOperation({ summary: 'Create a permission' })
  @ApiCreatedResponse({ type: PermissionResponseDto })
  async createPermission(@Body() dto: CreatePermissionDto) {
    return this.rbacService.createPermission(dto);
  }

  @Get('permissions/:permissionId')
  @ApiOperation({ summary: 'Get permission by ID' })
  @ApiOkResponse({ type: PermissionResponseDto })
  async getPermission(@Param('permissionId') permissionId: string) {
    return this.rbacService.getPermission(permissionId);
  }

  @Patch('permissions/:permissionId')
  @Audit('permission.update', {
    resourceType: 'permission',
    resourceId: 'params:permissionId',
    details: 'body',
  })
  @ApiOperation({ summary: 'Patch permission' })
  @ApiOkResponse({ type: PermissionResponseDto })
  async patchPermission(
    @Param('permissionId') permissionId: string,
    @Body() dto: PatchPermissionDto,
  ) {
    return this.rbacService.patchPermission(permissionId, dto);
  }

  @Delete('permissions/:permissionId')
  @Audit('permission.delete', {
    resourceType: 'permission',
    resourceId: 'params:permissionId',
    durable: true,
  })
  @ApiOperation({ summary: 'Delete permission' })
  async deletePermission(@Param('permissionId') permissionId: string) {
    return this.rbacService.deletePermission(permissionId);
  }

  // ── User Role Assignment ───────────────────────────────────────────────

  @Get('users/:userId/roles')
  @ApiOperation({ summary: 'List user roles', description: 'Returns all roles assigned to a user.' })
  async listUserRoles(@Param('userId') userId: string) {
    return this.rbacService.listUserRoles(userId);
  }

  @Patch('users/:userId/roles')
  @Audit('user.roles_update', {
    resourceType: 'user',
    resourceId: 'params:userId',
    details: 'body',
    // Privilege change — record it before the response is even flushed.
    durable: true,
  })
  @ApiOperation({ summary: 'Set user roles', description: 'Replaces the full role set for a user.' })
  async setUserRoles(
    @Param('userId') userId: string,
    @Body() dto: SetUserRolesDto,
    @Req() req: any,
  ) {
    return this.rbacService.setUserRoles(userId, dto, req.user?.user_id);
  }
}
