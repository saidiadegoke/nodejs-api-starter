import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketEntity } from './entities/support-ticket.entity';
import { SupportTicketMessageEntity } from './entities/support-ticket-message.entity';
import { SupportRepository } from './repositories/support.repository';
import { SupportService } from './services/support.service';
import { SupportController } from './controllers/support.controller';
import { SharedModule } from '../../utils';
import { RegistrationModule } from '../registration/registration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicketEntity, SupportTicketMessageEntity]),
    SharedModule,
    RegistrationModule,
  ],
  controllers: [SupportController],
  providers: [SupportRepository, SupportService],
  exports: [SupportRepository, SupportService, TypeOrmModule],
})
export class SupportModule {}
