import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard, CurrentUser } from '../../../shared';
import { UserActivityService } from '../services/user-activity.service';
import { UserActivityListResponseDto } from '../dto/user-responses.dto';

@ApiTags('Users')
@Controller('users')
export class UserActivityController {
  constructor(private readonly activityService: UserActivityService) {}

  @Get('me/activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get activity logs for current user',
    description: 'Returns a paginated list of security and authentication events for the current user.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'activity_type', required: false, example: 'auth:login' })
  @ApiOkResponse({ type: UserActivityListResponseDto, description: 'Activities retrieved successfully' })
  async getMyActivities(
    @CurrentUser('user_id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('activity_type') activityType?: string,
  ) {
    const result = await this.activityService.getUserActivities(userId, {
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
      activity_type: activityType || null,
    });
    return {
      message: 'Activities retrieved successfully',
      data: result,
    };
  }

  @Delete('me/activities/:activity_id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete activity log item',
    description: 'Removes a specific activity log entry belonging to the authenticated user.',
  })
  @ApiParam({ name: 'activity_id', description: 'Activity log item UUID' })
  @ApiOkResponse({ description: 'Activity deleted successfully' })
  async deleteActivity(
    @CurrentUser('user_id') userId: string,
    @Param('activity_id') activityId: string,
  ) {
    await this.activityService.deleteActivity(activityId, userId);
    return {
      message: 'Activity deleted successfully',
      data: null,
    };
  }

  @Get(':user_id/activities')
  @ApiOperation({
    summary: 'Get activities for a specified user',
    description: 'Returns activity logs for the target user ID.',
  })
  @ApiParam({ name: 'user_id', description: 'Target user UUID' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiOkResponse({ type: UserActivityListResponseDto, description: 'Activities retrieved successfully' })
  async getUserActivities(
    @Param('user_id') targetUserId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('activity_type') activityType?: string,
  ) {
    const result = await this.activityService.getUserActivities(targetUserId, {
      page: page ? parseInt(String(page), 10) : 1,
      limit: limit ? parseInt(String(limit), 10) : 20,
      activity_type: activityType || null,
    });
    return {
      message: 'Activities retrieved successfully',
      data: result,
    };
  }
}
