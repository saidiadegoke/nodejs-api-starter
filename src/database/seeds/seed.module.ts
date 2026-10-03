import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig, databaseConfig, jwtConfig } from '../../config';
import { DatabaseModule } from '../database.module';
import { UserSeedModule } from './user/user-seed.module';
import { RbacSeedModule } from './rbac/rbac-seed.module';
import { JupebSeedModule } from './jupeb/jupeb-seed.module';
import { CandidateSeedModule } from './candidate/candidate-seed.module';
import { SeedService } from './seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
    }),
    DatabaseModule,
    UserSeedModule,
    RbacSeedModule,
    JupebSeedModule,
    CandidateSeedModule,
  ],
  providers: [SeedService],
  exports: [SeedService, CandidateSeedModule],
})
export class SeedModule {}
