import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeyEntity } from './entities/api-key.entity';
import { ApiKeyRepository } from './repositories/api-key.repository';
import { ApiKeysService } from './services/api-keys.service';
import { ApiKeysController } from './controllers/api-keys.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKeyEntity])],
  controllers: [ApiKeysController],
  providers: [ApiKeyRepository, ApiKeysService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
