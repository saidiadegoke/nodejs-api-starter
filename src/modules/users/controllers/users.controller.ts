import {
  Body,
  Controller,
  Get,
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
@Controller('users')
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
    const search = query.q !== undefined ? query.q : query.search;
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
      data: result.users,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
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
