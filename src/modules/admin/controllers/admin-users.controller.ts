import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils';
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
    description: 'Aggregate counts: total, active, inactive users, verified emails, institution admins.',
  })
  @ApiOkResponse({ type: AdminUsersStatsResponseDto })
  async getStats() {
    return this.adminUsersService.getStats();
  }

  @Post()
  @ApiOperation({
    summary: 'Create admin/institution user',
    description: 'Creates a user with profile and role, optionally bound to a JUPEB university.',
  })
  @ApiCreatedResponse({ description: 'User created successfully.' })
  async createUserWithUniversity(@Body() dto: CreateAdminUserDto, @Req() req: any) {
    return this.adminUsersService.createUserWithUniversity(dto, req.user?.user_id);
  }
}
