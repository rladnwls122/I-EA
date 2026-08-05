import { Module } from '@nestjs/common';
import { ExamSessionsModule } from '@/modules/exam-sessions/exam-sessions.module';
import { QuestionsModule } from '@/modules/questions/questions.module';
import { WorkbooksController } from './workbooks.controller';
import { WorkbooksService } from './workbooks.service';

@Module({
  // "문제집 바로 풀기"가 ExamSessionsService로 세션을 조립한다.
  // 문항 일괄 담기(POST :id/questions/batch)는 QuestionsService의 생성 경로를 그대로 부른다 —
  // 문항 생성 규칙을 workbooks 쪽에 복사하면 두 경로가 조용히 갈라진다.
  imports: [ExamSessionsModule, QuestionsModule],
  controllers: [WorkbooksController],
  providers: [WorkbooksService],
})
export class WorkbooksModule {}
