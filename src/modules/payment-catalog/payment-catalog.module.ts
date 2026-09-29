import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentItemEntity } from './entities/payment-item.entity';
import { PaymentStructureEntity } from './entities/payment-structure.entity';
import { PaymentItemRepository } from './repositories/payment-item.repository';
import { PaymentStructureRepository } from './repositories/payment-structure.repository';
import { PaymentCatalogService } from './services/payment-catalog.service';
import { PaymentCatalogController } from './controllers/payment-catalog.controller';
import { SharedModule } from '../../shared';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentItemEntity, PaymentStructureEntity]),
    SharedModule,
  ],
  controllers: [PaymentCatalogController],
  providers: [
    PaymentItemRepository,
    PaymentStructureRepository,
    PaymentCatalogService,
  ],
  exports: [
    PaymentItemRepository,
    PaymentStructureRepository,
    PaymentCatalogService,
    TypeOrmModule,
  ],
})
export class PaymentCatalogModule {}
