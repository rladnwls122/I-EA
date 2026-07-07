import { Module } from '@nestjs/common';
import { PassagesController } from './passages.controller';
import { PassagesService } from './passages.service';

@Module({
  controllers: [PassagesController],
  providers: [PassagesService],
  exports: [PassagesService],
})
export class PassagesModule {}
