import { Module } from '@nestjs/common';
import { AiGenerationModule } from '@/modules/ai-generation/ai-generation.module';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  // 인라인 선지 재생성(Task B2)이 GeminiLlmService를 쓴다. AiGenerationModule이 export한다.
  imports: [AiGenerationModule],
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
