import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileEntity } from './entities/file.entity';
import { FileRepository } from './repositories/file.repository';
import { FilesService } from './services/files.service';
import { FilesController } from './controllers/files.controller';
import { SharedModule } from '../../utils';

@Module({
  imports: [TypeOrmModule.forFeature([FileEntity]), SharedModule],
  controllers: [FilesController],
  providers: [FileRepository, FilesService],
  exports: [FileRepository, FilesService, TypeOrmModule],
})
export class FilesModule {}
