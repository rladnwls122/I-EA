import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3Service } from './s3.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, S3Service],
})
export class MediaModule {}
