import { Module } from '@nestjs/common';
import { ExamSessionsController } from './exam-sessions.controller';
import { ExamSessionsService } from './exam-sessions.service';
import { AiGenerationModule } from '@/modules/ai-generation/ai-generation.module';

@Module({
  imports: [AiGenerationModule], // GeminiLlmService 주입(AiGenerationModule이 export)
  controllers: [ExamSessionsController],
  providers: [ExamSessionsService],
  // WorkbooksModule의 "문제집 바로 풀기"(POST /workbooks/:id/start)가 주입해 쓴다.
  exports: [ExamSessionsService],
})
export class ExamSessionsModule {}
