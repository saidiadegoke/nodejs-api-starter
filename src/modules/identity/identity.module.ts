import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NinVerificationEntity, BiometricCaptureEntity } from './entities';
import { NinVerificationRepository, BiometricCaptureRepository } from './repositories';
import { MockNinProvider, SpeedySmsNinProvider } from './providers';
import { NinAdapterService } from './services/nin-adapter.service';
import { NinEventsService } from './services/nin-events.service';
import { NinWriteThroughService } from './services/nin-write-through.service';
import { IdentityService } from './services/identity.service';
import { IdentityController } from './controllers/identity.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NinVerificationEntity,
      BiometricCaptureEntity,
    ]),
  ],
  controllers: [IdentityController],
  providers: [
    NinVerificationRepository,
    BiometricCaptureRepository,
    MockNinProvider,
    SpeedySmsNinProvider,
    NinAdapterService,
    NinEventsService,
    NinWriteThroughService,
    IdentityService,
  ],
  exports: [
    NinVerificationRepository,
    BiometricCaptureRepository,
    NinAdapterService,
    NinEventsService,
    NinWriteThroughService,
    IdentityService,
  ],
})
export class IdentityModule {}
