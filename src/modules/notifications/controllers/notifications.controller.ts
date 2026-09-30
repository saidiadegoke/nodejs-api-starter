import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Query,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NotificationsService } from '../services/notifications.service';
import {
  NotificationQueryDto,
  UpdateNotificationReadDto,
  NotificationListResponseDto,
  UnreadCountResponseDto,
  UpdateReadStatusResponseDto,
  MarkAllReadResponseDto,
  DeleteResultResponseDto,
} from '../dto';
import { JwtAuthGuard } from '../../../utils';

@ApiTags('In-App Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user notifications with pagination & filtering',
    description: 'Retrieves current user notifications, supporting unread filter, limit, and page.',
  })
  @ApiOkResponse({ type: NotificationListResponseDto })
  async getNotifications(@Query() query: NotificationQueryDto, @Req() req: any) {
    return this.notificationsService.getUserNotifications(req.user?.user_id, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get total unread notifications count',
    description: 'Returns the count of unread notifications for badge counters.',
  })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async getUnreadCount(@Req() req: any) {
    const count = await this.notificationsService.getUnreadCount(req.user?.user_id);
    return { count };
  }

  @Put('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Sets read = true on all unread notifications for the authenticated user.',
  })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  async markAllAsReadPut(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user?.user_id);
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read (PATCH alias)',
    description: 'Sets read = true on all unread notifications for the authenticated user.',
  })
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  async markAllAsReadPatch(@Req() req: any) {
    return this.notificationsService.markAllAsRead(req.user?.user_id);
  }

  @Put(':notification_id/read')
  @ApiOperation({
    summary: 'Mark single notification as read/unread',
    description: 'Updates the read status of a specific notification.',
  })
  @ApiOkResponse({ type: UpdateReadStatusResponseDto })
  async markAsReadPut(
    @Param('notification_id') notificationId: string,
    @Body() body: UpdateNotificationReadDto,
    @Req() req: any,
  ) {
    return this.notificationsService.markAsRead(
      notificationId,
      req.user?.user_id,
      body.is_read !== undefined ? body.is_read : true,
    );
  }

  @Patch(':notification_id/read')
  @ApiOperation({
    summary: 'Mark single notification as read/unread (PATCH alias)',
    description: 'Updates the read status of a specific notification.',
  })
  @ApiOkResponse({ type: UpdateReadStatusResponseDto })
  async markAsReadPatch(
    @Param('notification_id') notificationId: string,
    @Body() body: UpdateNotificationReadDto,
    @Req() req: any,
  ) {
    return this.notificationsService.markAsRead(
      notificationId,
      req.user?.user_id,
      body.is_read !== undefined ? body.is_read : true,
    );
  }

  @Delete(':notification_id')
  @ApiOperation({
    summary: 'Delete notification by ID',
    description: 'Permanently deletes a notification belonging to the authenticated user.',
  })
  @ApiOkResponse({ type: DeleteResultResponseDto })
  async deleteNotification(
    @Param('notification_id') notificationId: string,
    @Req() req: any,
  ) {
    return this.notificationsService.deleteNotification(notificationId, req.user?.user_id);
  }

  @Delete()
  @ApiOperation({
    summary: 'Delete all notifications',
    description: 'Clears all notifications for the authenticated user.',
  })
  async deleteAllNotifications(@Req() req: any) {
    return this.notificationsService.deleteAllNotifications(req.user?.user_id);
  }
}
