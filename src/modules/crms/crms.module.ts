import { Module } from '@nestjs/common';
import { CrmsController } from './controllers/crms.controller';
import { CrmsService } from './services/crms.service';
import { SharedModule } from '../../utils';

@Module({
  imports: [SharedModule],
  controllers: [CrmsController],
  providers: [CrmsService],
  exports: [CrmsService],
})
export class CrmsModule {}
