import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrJobEntity, OcrResultEntity } from './entities';
import { OcrController } from './controllers/ocr.controller';
import { OcrService } from './services/ocr.service';
import { OcrWorkerService } from './services/ocr-worker.service';
import { FilesModule } from '../files/files.module';
import { SharedModule } from '../../utils';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrJobEntity, OcrResultEntity]),
    FilesModule,
    SharedModule,
  ],
  controllers: [OcrController],
  providers: [OcrService, OcrWorkerService],
  exports: [OcrService, OcrWorkerService],
})
export class OcrModule {}
