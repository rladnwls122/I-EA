import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaKeepAliveService } from './prisma-keepalive.service';

/**
 * @Global — 모든 모듈이 PrismaService를 별도 import 없이 주입받을 수 있게 한다.
 * PrismaKeepAliveService는 어디서도 주입받지 않지만 provider로 등록해두면
 * Nest가 부팅 시 인스턴스화해 @Cron 스케줄을 등록한다 — export는 불필요.
 */
@Global()
@Module({
  providers: [PrismaService, PrismaKeepAliveService],
  exports: [PrismaService],
})
export class PrismaModule {}
