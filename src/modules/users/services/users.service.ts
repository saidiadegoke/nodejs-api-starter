import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRepository, UserListOptions } from '../repositories/user.repository';
import { ProfileRepository } from '../repositories/profile.repository';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly profileRepo: ProfileRepository,
  ) {}

  async getAllUsers(
    page = 1,
    limit = 10,
    search?: string,
    _currentUserId?: string,
    options: {
      role?: string;
      include_all?: string | boolean;
      include_students?: string | boolean;
      include_institution?: string | boolean;
      exclude_roles?: string;
    } = {},
  ) {
    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.max(1, parseInt(String(limit), 10) || 10);
    const offset = (pageNum - 1) * limitNum;

    const filterOptions: UserListOptions = {
      q: search?.trim() || undefined,
      role: options.role?.trim() || undefined,
    };

    const users = await this.userRepo.findAll(limitNum, offset, filterOptions.q, filterOptions);
    const total = await this.userRepo.count(filterOptions.q, filterOptions);

    return {
      users,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  async getUserById(userId: string, _currentUserId?: string) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUser(userId: string, updateData: Partial<UserEntity> & { first_name?: string; last_name?: string }) {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userFields: Partial<UserEntity> = {};
    if (updateData.email !== undefined) userFields.email = updateData.email;
    if (updateData.phone !== undefined) userFields.phone = updateData.phone;
    if (updateData.status !== undefined) userFields.status = updateData.status;

    if (Object.keys(userFields).length > 0) {
      await this.userRepo.update(userId, userFields);
    }

    if (updateData.first_name !== undefined || updateData.last_name !== undefined) {
      await this.profileRepo.upsert(userId, {
        firstName: updateData.first_name,
        lastName: updateData.last_name,
      });
    }

    return await this.getUserById(userId);
  }

  async activateUser(userId: string) {
    const user = await this.userRepo.updateStatus(userId, 'active');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async deactivateUser(userId: string) {
    const user = await this.userRepo.updateStatus(userId, 'inactive');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string) {
    return await this.userRepo.findByEmail(email);
  }

  async findByPhone(phone: string) {
    return await this.userRepo.findByPhone(phone);
  }

  async findByEmailOrPhone(identifier: string) {
    return await this.userRepo.findByEmailOrPhone(identifier);
  }

  async create(userData: Partial<UserEntity>) {
    return await this.userRepo.create(userData);
  }

  async softDelete(userId: string) {
    return await this.userRepo.softDelete(userId);
  }
}
