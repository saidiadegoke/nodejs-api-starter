import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity, UserRoleEntity } from '../../../modules/admin/entities/admin.entity';
import { UserEntity } from '../../../modules/users/entities/user.entity';

interface DefaultRole {
  name: string;
  displayName: string;
  description: string;
  isSystem: boolean;
}

const DEFAULT_ROLES: DefaultRole[] = [
  { name: 'super_admin', displayName: 'Super Administrator', description: 'Full system access with all permissions', isSystem: true },
  { name: 'admin', displayName: 'Administrator', description: 'Administrative access for system management', isSystem: true },
  { name: 'jupeb_admin', displayName: 'JUPEB Administrator', description: 'JUPEB portal administrator with full access to JUPEB operations', isSystem: true },
  { name: 'institution_admin', displayName: 'Institution Administrator', description: 'Institution administrator scoped to a single university', isSystem: true },
  { name: 'operator', displayName: 'Operator', description: 'Operational staff access for day-to-day management', isSystem: true },
  { name: 'user', displayName: 'User', description: 'Standard user access', isSystem: true },
  { name: 'student', displayName: 'Student', description: 'Student user access', isSystem: true },
];

@Injectable()
export class RbacSeedService {
  private readonly logger = new Logger(RbacSeedService.name);

  constructor(
    @InjectRepository(RoleEntity)
    private readonly roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async run(): Promise<void> {
    for (const roleDef of DEFAULT_ROLES) {
      try {
        await this.upsertRole(roleDef);
      } catch (error) {
        this.logger.error(
          `Failed to seed role ${roleDef.name}: ${(error as Error).message}`,
        );
      }
    }

    try {
      await this.assignSuperAdminRole();
    } catch (error) {
      this.logger.error(
        `Failed to assign super_admin role: ${(error as Error).message}`,
      );
    }
  }

  private async upsertRole(roleDef: DefaultRole): Promise<void> {
    let role = await this.roleRepo.findOne({ where: { name: roleDef.name } });
    if (!role) {
      role = await this.roleRepo.save(
        this.roleRepo.create({
          name: roleDef.name,
          displayName: roleDef.displayName,
          description: roleDef.description,
          isSystem: roleDef.isSystem,
          status: 'active',
        }),
      );
      this.logger.log(`Created role: ${roleDef.name}`);
    } else if (!role.displayName) {
      role.displayName = roleDef.displayName;
      await this.roleRepo.save(role);
    }
  }

  private async assignSuperAdminRole(): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { email: 'admin@example.com' },
    });
    const role = await this.roleRepo.findOne({
      where: { name: 'super_admin' },
    });

    if (user && role) {
      const existingAssignment = await this.userRoleRepo.findOne({
        where: { userId: user.id, roleId: role.id },
      });

      if (!existingAssignment) {
        await this.userRoleRepo.save(
          this.userRoleRepo.create({
            userId: user.id,
            roleId: role.id,
          }),
        );
        this.logger.log(`Assigned super_admin role to admin@example.com`);
      }
    }
  }
}
