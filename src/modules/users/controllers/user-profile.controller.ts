import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '../../../utils';
import { UserProfileService } from '../services/user-profile.service';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import {
  UserProfileResponseDto,
  UserPreferencesResponseDto,
} from '../dto/user-responses.dto';

@ApiTags('Users')
@Controller('users')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get('countries')
  @ApiOperation({
    summary: 'List supported countries',
    description: 'Returns the catalog of all supported countries, phone codes, and ISO abbreviations.',
  })
  @ApiOkResponse({ description: 'Countries retrieved successfully' })
  async getCountries() {
    const countries = await this.userProfileService.getCountries();
    return {
      message: 'Countries retrieved successfully',
      data: countries,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns profile details, verified status, roles, and permissions for the authenticated user.',
  })
  @ApiOkResponse({ type: UserProfileResponseDto, description: 'Profile retrieved successfully' })
  async getMe(@CurrentUser('user_id') userId: string) {
    const profile = await this.userProfileService.getMe(userId);
    return {
      message: 'Profile retrieved successfully',
      data: profile,
    };
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Updates bio, names, residential address, avatar URL, and demographics for the authenticated user.',
  })
  @ApiOkResponse({ type: UserProfileResponseDto, description: 'Profile updated successfully' })
  async updateMe(
    @CurrentUser('user_id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.userProfileService.updateMe(userId, dto);
    return {
      message: 'Profile updated successfully',
      data: updated,
    };
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get user account statistics',
    description: 'Returns calculated engagement and account metrics for the authenticated user.',
  })
  @ApiOkResponse({ description: 'User stats retrieved successfully' })
  async getStats(@CurrentUser('user_id') userId: string) {
    const stats = await this.userProfileService.getStats(userId);
    return {
      message: 'User stats retrieved successfully',
      data: stats,
    };
  }

  @Get('me/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user permissions',
    description: 'Lists all direct and role-derived permission keys for the authenticated user.',
  })
  @ApiOkResponse({ description: 'Permissions retrieved successfully' })
  async getMyPermissions(@CurrentUser('user_id') userId: string) {
    const permissions = await this.userProfileService.getMyPermissions(userId);
    return {
      message: 'Permissions retrieved successfully',
      data: {
        permissions,
      },
    };
  }

  @Get('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get user preferences',
    description: 'Returns UI and notification preferences for the authenticated user.',
  })
  @ApiOkResponse({ type: UserPreferencesResponseDto, description: 'User preferences retrieved successfully' })
  async getPreferences(@CurrentUser('user_id') userId: string) {
    const preferences = await this.userProfileService.getPreferences(userId);
    return {
      message: 'User preferences retrieved successfully',
      data: preferences,
    };
  }

  @Patch('me/preferences')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update user preferences',
    description: 'Updates notification and theme preferences for the authenticated user.',
  })
  @ApiOkResponse({ type: UserPreferencesResponseDto, description: 'User preferences updated successfully' })
  async updatePreferences(
    @CurrentUser('user_id') userId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    const updated = await this.userProfileService.updatePreferences(userId, dto);
    return {
      message: 'User preferences updated successfully',
      data: updated,
    };
  }

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Soft-delete current user account',
    description: 'Marks the authenticated user account as deleted.',
  })
  @ApiOkResponse({ description: 'Account successfully deleted' })
  async deleteMe(@CurrentUser('user_id') userId: string) {
    const res = await this.userProfileService.deleteMe(userId);
    return {
      message: res.message,
      data: null,
    };
  }

  @Put('me/settings/notifications')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update notification settings shortcut',
    description: 'Quick toggle for push notification settings.',
  })
  @ApiOkResponse({ type: UserPreferencesResponseDto, description: 'Notification settings updated' })
  async updateNotificationSettings(
    @CurrentUser('user_id') userId: string,
    @Body() body: any,
  ) {
    const updated = await this.userProfileService.updatePreferences(userId, {
      push_notifications_enabled: body.push_notifications,
    });
    return {
      message: 'Notification settings updated successfully',
      data: updated,
    };
  }

  @Get(':user_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get user profile by ID',
    description: 'Retrieves public profile information for a given user ID.',
  })
  @ApiParam({ name: 'user_id', description: 'Target user UUID' })
  @ApiOkResponse({ type: UserProfileResponseDto, description: 'User retrieved successfully' })
  async getUserById(@Param('user_id') targetUserId: string) {
    const user = await this.userProfileService.getUserById(targetUserId);
    return {
      message: 'User retrieved successfully',
      data: user,
    };
  }
}
