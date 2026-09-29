import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentEntity, PaymentReconciliationEntity } from './entities';
import { PaymentRepository, PaymentReconciliationRepository } from './repositories';
import { FinanceService } from './services';
import { FinanceController } from './controllers';
import { RegistrationModule } from '../registration/registration.module';
import { SessionsModule } from '../sessions/sessions.module';
import { PaymentCatalogModule } from '../payment-catalog/payment-catalog.module';
import { InstitutionsModule } from '../institutions/institutions.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentEntity,
      PaymentReconciliationEntity,
    ]),
    RegistrationModule,
    SessionsModule,
    PaymentCatalogModule,
    InstitutionsModule,
    UsersModule,
  ],
  controllers: [FinanceController],
  providers: [
    PaymentRepository,
    PaymentReconciliationRepository,
    FinanceService,
  ],
  exports: [
    PaymentRepository,
    PaymentReconciliationRepository,
    FinanceService,
  ],
})
export class FinanceModule {}
