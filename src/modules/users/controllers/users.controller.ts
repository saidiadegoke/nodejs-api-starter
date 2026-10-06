import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import {
  JwtAuthGuard,
  PermissionsGuard,
  RequirePermission,
  CurrentUser,
} from '../../../utils';
import { UsersService } from '../services/users.service';
import { UserQueryDto, UpdateUserDto } from '../dto/user-query.dto';
import { UserProfileResponseDto } from '../dto/user-responses.dto';

@ApiTags('Users')
@Controller(['users', 'admin/users'])
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermission('users.view')
  @ApiOperation({
    summary: 'List users with pagination and filtering',
    description: 'Retrieves a paginated list of system users. Requires users.view permission.',
  })
  @ApiOkResponse({ description: 'Users list retrieved successfully' })
  async getAllUsers(
    @CurrentUser('user_id') currentUserId: string,
    @Query() query: UserQueryDto,
  ) {
    const search = query.q ?? query.query ?? query.search;
    const result = await this.usersService.getAllUsers(
      query.page,
      query.limit,
      search,
      currentUserId,
      {
        role: query.role,
        include_all: query.include_all,
        include_students: query.include_students,
        include_institution: query.include_institution,
        exclude_roles: query.exclude_roles,
      },
    );
    return {
      success: true,
      message: 'Users retrieved successfully',
      data: result.users,
      users: result.users,
      total: result.total,
      page: result.page,
      limit: result.limit,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        total_pages: result.totalPages,
      },
    };
  }

  @Get('stats')
  @RequirePermission('users.view')
  @ApiOperation({
    summary: 'User stats summary',
    description:
      'Aggregate counts: total, active, inactive users, verified emails, institution admins. Scoped to the caller\'s institution; super admins see global counts.',
  })
  @ApiOkResponse({ description: 'User stats retrieved successfully' })
  async getStats(@CurrentUser('user_id') userId: string) {
    return this.usersService.getUsersStats(userId);
  }

  @Get(':userId')
  @RequirePermission('users.view')
  @ApiOperation({
    summary: 'Get user details by ID',
    description: 'Retrieves a single user by their UUID. Requires users.view permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiOkResponse({ description: 'User retrieved successfully' })
  async getUserById(
    @Param('userId') userId: string,
    @CurrentUser('user_id') currentUserId: string,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      if (userId === 'stats') {
        return this.getStats(currentUserId);
      }
      throw new NotFoundException('User not found');
    }
    const user = await this.usersService.getUserById(userId);
    return {
      success: true,
      message: 'User retrieved successfully',
      data: user,
      ...user,
    };
  }

  @Patch(':userId')
  @RequirePermission('users.update')
  @ApiOperation({
    summary: 'Update user account',
    description: 'Updates email, phone, name, or status for a user. Requires users.update permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiOkResponse({ type: UserProfileResponseDto, description: 'User updated successfully' })
  async updateUser(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    const user = await this.usersService.updateUser(userId, dto);
    return {
      message: 'User updated successfully',
      data: user,
    };
  }

  @Delete(':userId')
  @RequirePermission('users.delete', 'users.update', 'user.delete')
  @ApiOperation({
    summary: 'Delete user account',
    description: 'Soft-deletes a user account. Requires users.delete or admin permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiOkResponse({ description: 'User deleted successfully' })
  async deleteUser(@Param('userId') userId: string) {
    await this.usersService.softDelete(userId);
    return {
      success: true,
      message: 'User deleted successfully',
    };
  }

  @Post(':userId/activate')
  @RequirePermission('users.update')
  @ApiOperation({
    summary: 'Activate user account',
    description: 'Sets user status to active. Requires users.update permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiOkResponse({ description: 'User activated successfully' })
  async activateUser(@Param('userId') userId: string) {
    const user = await this.usersService.activateUser(userId);
    return {
      message: 'User activated successfully',
      data: user,
    };
  }

  @Post(':userId/deactivate')
  @RequirePermission('users.update')
  @ApiOperation({
    summary: 'Deactivate user account',
    description: 'Sets user status to inactive. Requires users.update permission.',
  })
  @ApiParam({ name: 'userId', description: 'Target user UUID' })
  @ApiOkResponse({ description: 'User deactivated successfully' })
  async deactivateUser(@Param('userId') userId: string) {
    const user = await this.usersService.deactivateUser(userId);
    return {
      message: 'User deactivated successfully',
      data: user,
    };
  }
}
