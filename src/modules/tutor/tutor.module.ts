import { Module } from '@nestjs/common';
import { AiGenerationModule } from '@/modules/ai-generation/ai-generation.module';
import { TutorController } from './tutor.controller';
import { TutorService } from './tutor.service';

/**
 * AI 튜터. GeminiLlmService는 AiGenerationModule이 export하므로 그 모듈을 import한다.
 * REDIS_CLIENT는 RedisModule(@Global)이 전역으로 제공한다.
 */
@Module({
  imports: [AiGenerationModule],
  controllers: [TutorController],
  providers: [TutorService],
})
export class TutorModule {}
