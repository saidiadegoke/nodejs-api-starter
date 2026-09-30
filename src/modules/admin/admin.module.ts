import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RoleEntity,
  PermissionEntity,
  RolePermissionEntity,
  UserRoleEntity,
  PlatformSettingEntity,
  RequestLogEntity,
} from './entities/admin.entity';
import { AdminRepository } from './repositories/admin.repository';
import { RbacService } from './services/rbac.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminSettingsService } from './services/admin-settings.service';
import { AdminErrorLogService } from './services/admin-error-log.service';
import { AdminAuditService } from './services/admin-audit.service';
import { AdminDbCleanerService } from './services/admin-db-cleaner.service';
import { RbacController } from './controllers/rbac.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminSettingsController } from './controllers/admin-settings.controller';
import { AdminErrorLogController } from './controllers/admin-error-log.controller';
import { AdminAuditController } from './controllers/admin-audit.controller';
import { AdminDbCleanerController } from './controllers/admin-db-cleaner.controller';
import { SharedModule } from '../../utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RoleEntity,
      PermissionEntity,
      RolePermissionEntity,
      UserRoleEntity,
      PlatformSettingEntity,
      RequestLogEntity,
    ]),
    SharedModule,
  ],
  controllers: [
    RbacController,
    AdminUsersController,
    AdminSettingsController,
    AdminErrorLogController,
    AdminAuditController,
    AdminDbCleanerController,
  ],
  providers: [
    AdminRepository,
    RbacService,
    AdminUsersService,
    AdminSettingsService,
    AdminErrorLogService,
    AdminAuditService,
    AdminDbCleanerService,
  ],
  exports: [
    AdminRepository,
    RbacService,
    AdminAuditService,
    TypeOrmModule,
  ],
})
export class AdminModule {}
