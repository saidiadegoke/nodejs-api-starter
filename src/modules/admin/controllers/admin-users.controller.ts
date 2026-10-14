import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser, Audit } from '../../../utils';
import { AdminUsersService } from '../services/admin-users.service';
import { CreateAdminUserDto, AdminUsersStatsResponseDto } from '../dto';

@ApiTags('Admin Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get('stats')
  @ApiOperation({
    summary: 'User stats summary',
    description:
      'Aggregate counts: total, active, inactive users, verified emails, institution admins. Scoped to the caller\'s institution; super admins see global counts.',
  })
  @ApiOkResponse({ type: AdminUsersStatsResponseDto })
  async getStats(@CurrentUser('user_id') userId: string) {
    return this.adminUsersService.getStats(userId);
  }

  @Post()
  @Audit('user.create_with_university', {
    resourceType: 'user',
    resourceId: 'result:user:user_id',
    universityId: 'result:university:id',
    details: ({ result }) => ({
      email: result?.user?.email || result?.email,
      role: result?.user?.role || result?.role,
      university_id: result?.university?.id || result?.university_id,
    }),
  })
  @ApiOperation({
    summary: 'Create admin/institution user',
    description: 'Creates a user with profile and role, optionally bound to a JUPEB university.',
  })
  @ApiCreatedResponse({ description: 'User created successfully.' })
  async createUserWithUniversity(
    @Body() dto: CreateAdminUserDto,
    @CurrentUser('user_id') userId: string,
  ) {
    const result = await this.adminUsersService.createUserWithUniversity(dto, userId);
    return {
      success: true,
      message: result.university
        ? 'User created and associated with university'
        : 'User created',
      data: result,
      ...result,
    };
  }
}
