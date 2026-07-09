import { Module } from '@nestjs/common';
import { ExamSessionsModule } from '@/modules/exam-sessions/exam-sessions.module';
import { WorkbooksController } from './workbooks.controller';
import { WorkbooksService } from './workbooks.service';

@Module({
  // "문제집 바로 풀기"가 ExamSessionsService로 세션을 조립한다.
  imports: [ExamSessionsModule],
  controllers: [WorkbooksController],
  providers: [WorkbooksService],
})
export class WorkbooksModule {}
