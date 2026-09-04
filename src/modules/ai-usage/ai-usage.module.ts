import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAiUsageController, MyAiUsageController } from './ai-usage.controller';
import { AiUsageService } from './ai-usage.service';
import { LlmPricingService } from './llm-pricing';
import { LlmUsageRecorder } from './llm-usage.recorder';

/**
 * LLM 원가 원장.
 *
 * @Global인 이유: 기록기(LlmUsageRecorder)는 LLM을 호출하는 어느 모듈에서든 필요한데,
 * 그때마다 이 모듈을 import 목록에 넣는 걸 잊으면 **그 경로의 원가만 조용히 누락된다**.
 * 원장은 한 군데라도 빠지면 총합이 틀리는 종류의 장치라, PrismaModule과 같은 이유로
 * 전역으로 둔다.
 */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [MyAiUsageController, AdminAiUsageController],
  providers: [LlmPricingService, LlmUsageRecorder, AiUsageService],
  exports: [LlmUsageRecorder],
})
export class AiUsageModule {}
