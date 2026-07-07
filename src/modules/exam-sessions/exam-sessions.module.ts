import { Module } from '@nestjs/common';
import { ExamSessionsController } from './exam-sessions.controller';
import { ExamSessionsService } from './exam-sessions.service';

@Module({
  controllers: [ExamSessionsController],
  providers: [ExamSessionsService],
})
export class ExamSessionsModule {}
