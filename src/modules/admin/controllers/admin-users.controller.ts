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
    resourceId: 'result:id',
    universityId: 'result:university_id',
    // Never store the submitted password — pick the fields the legacy row carried.
    details: ({ result }) => ({
      email: result?.email,
      role: result?.role,
      university_id: result?.university_id,
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
    return this.adminUsersService.createUserWithUniversity(dto, userId);
  }
}
