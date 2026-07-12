import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from './prisma.service';

/**
 * TiDB Serverless는 일정 시간 유휴 상태면 커넥션을 끊는다(콜드 스타트 → 이후 요청이
 * "Server has closed the connection" 오류로 503/401을 유발할 수 있다. jwt.strategy.ts의
 * 재연결 재시도는 이미 끊긴 뒤의 방어책이고, 이 서비스는 애초에 끊기지 않게 5분마다
 * 가장 가벼운 쿼리로 커넥션 풀을 깨워둔다.
 */
@Injectable()
export class PrismaKeepAliveService {
  private readonly logger = new Logger(PrismaKeepAliveService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/5 * * * *')
  async handleKeepAlive(): Promise<void> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.logger.log('TiDB Serverless Keep-Alive: 커넥션 정상.');
    } catch (error) {
      this.logger.error(
        `TiDB Serverless Keep-Alive 실패: ${(error as Error).message}`,
      );
    }
  }
}
