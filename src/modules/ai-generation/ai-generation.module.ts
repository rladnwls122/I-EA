import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiGenerationController } from './ai-generation.controller';
import { AiGenerationService } from './ai-generation.service';
import { AiGenerationProcessor } from './ai-generation.processor';
import { GeminiLlmService } from './llm/gemini-llm.service';
import { AuthoringChatService } from './authoring-chat.service';
import { AI_GENERATION_QUEUE } from './ai-generation.constants';

@Module({
  imports: [ConfigModule, BullModule.registerQueue({ name: AI_GENERATION_QUEUE })],
  controllers: [AiGenerationController],
  providers: [AiGenerationService, AiGenerationProcessor, GeminiLlmService, AuthoringChatService],
  // GeminiLlmService를 export → 이 모듈을 import하는 다른 모듈의 클래스에서도 주입/참조 가능.
  exports: [AiGenerationService, GeminiLlmService],
})
export class AiGenerationModule {}
