import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSIONS_KEY = 'REQUIRE_PERMISSIONS';
export const REQUIRE_ALL_PERMISSIONS_KEY = 'REQUIRE_ALL_PERMISSIONS';
export const REQUIRE_ROLES_KEY = 'REQUIRE_ROLES';

/**
 * Require user to have ANY of the specified permissions
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

/**
 * Require user to have ALL of the specified permissions
 */
export const RequireAllPermissions = (...permissions: string[]) =>
  SetMetadata(REQUIRE_ALL_PERMISSIONS_KEY, permissions);

/**
 * Require user to have ANY of the specified roles
 */
export const RequireRole = (...roles: string[]) =>
  SetMetadata(REQUIRE_ROLES_KEY, roles);
