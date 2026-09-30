import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationRepository } from './repositories/notification.repository';
import { NotificationsService } from './services/notifications.service';
import { NotificationsController } from './controllers/notifications.controller';
import { SharedModule } from '../../utils';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity]), SharedModule],
  controllers: [NotificationsController],
  providers: [NotificationRepository, NotificationsService],
  exports: [NotificationRepository, NotificationsService, TypeOrmModule],
})
export class NotificationsModule {}
