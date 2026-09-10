import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** @Global — 알림을 보내는 모듈(댓글 등)이 어디든 import 없이 주입받는다. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
