import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { CommodLogger } from './commod-logger.service';
import { LoggerFactory } from './logger.factory';

@Global()
@Module({
  imports: [HttpModule],
  providers: [CommodLogger, LoggerFactory],
  exports: [CommodLogger, LoggerFactory],
})
export class LoggerModule {}
