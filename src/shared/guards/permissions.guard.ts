import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import {
  REQUIRE_PERMISSIONS_KEY,
  REQUIRE_ALL_PERMISSIONS_KEY,
  REQUIRE_ROLES_KEY,
} from '../decorators/require-permission.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredAllPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_ALL_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions && !requiredAllPermissions && !requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.user_id;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    // Role check (ANY)
    if (requiredRoles && requiredRoles.length > 0) {
      const rolesRes = await this.dataSource.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1
         AND r.owner_jupeb_university_id IS NULL
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [userId],
      );
      const userRoles = rolesRes.map((r: any) => r.name);
      const hasAnyRole = requiredRoles.some((role) => userRoles.includes(role));
      if (!hasAnyRole) {
        throw new ForbiddenException({
          message: `Access denied. Required role(s): ${requiredRoles.join(', ')}`,
          details: { required_roles: requiredRoles, user_roles: userRoles },
        });
      }
      request.user.roles = userRoles;
    }

    // Permission check (ANY)
    if (requiredPermissions && requiredPermissions.length > 0) {
      const checks = await Promise.all(
        requiredPermissions.map((perm) => this.hasPermission(userId, perm)),
      );
      const hasAnyPermission = checks.some(Boolean);
      if (!hasAnyPermission) {
        throw new ForbiddenException({
          message: `Access denied. Required permission(s): ${requiredPermissions.join(', ')}`,
          details: { required_permissions: requiredPermissions },
        });
      }
    }

    // Permission check (ALL)
    if (requiredAllPermissions && requiredAllPermissions.length > 0) {
      const checks = await Promise.all(
        requiredAllPermissions.map((perm) => this.hasPermission(userId, perm)),
      );
      const hasAll = checks.every(Boolean);
      if (!hasAll) {
        throw new ForbiddenException({
          message: `Access denied. All permissions required: ${requiredAllPermissions.join(', ')}`,
          details: { required_permissions: requiredAllPermissions },
        });
      }
    }

    return true;
  }

  private async hasPermission(userId: string, permissionName: string): Promise<boolean> {
    const result = await this.dataSource.query(
      `SELECT EXISTS (
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON up.permission_id = p.id
        WHERE up.user_id = $1 
        AND p.name = $2
        AND up.granted = true
        AND (up.expires_at IS NULL OR up.expires_at > NOW())
        
        UNION
        
        SELECT 1 FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1 
        AND p.name = $2
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
        
        AND NOT EXISTS (
          SELECT 1 FROM user_permissions up2
          WHERE up2.user_id = $1 
          AND up2.permission_id = p.id
          AND up2.granted = false
        )
      ) AS has_permission`,
      [userId, permissionName],
    );
    return Boolean(result[0]?.has_permission);
  }
}
