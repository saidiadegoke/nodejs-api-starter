import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity, UserRoleEntity } from '../../../modules/admin/entities/admin.entity';
import { UserEntity } from '../../../modules/users/entities/user.entity';
import { RbacSeedService } from './rbac-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, UserRoleEntity, UserEntity])],
  providers: [RbacSeedService],
  exports: [RbacSeedService],
})
export class RbacSeedModule {}
