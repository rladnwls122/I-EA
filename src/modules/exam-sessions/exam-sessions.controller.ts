import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { ExamSessionsService } from './exam-sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SubmitAnswerDto } from './dto/submit-answer.dto';

@ApiTags('exam-sessions')
@ApiBearerAuth()
@Controller('exam-sessions')
export class ExamSessionsController {
  constructor(private readonly service: ExamSessionsService) {}

  @Post()
  @ApiOperation({ summary: '모의고사 세션 조립 (필터 → 문항 스냅샷)' })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateSessionDto) {
    return this.service.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '세션 응시 데이터 조회 (진행 중이면 정답 마스킹)' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getById(id, user.id);
  }

  @Put('questions/:sessionQuestionId/answer')
  @ApiOperation({ summary: '문항 답안 제출/수정 (즉시 채점, OMR)' })
  submitAnswer(
    @Param('sessionQuestionId', ParseUUIDPipe) sessionQuestionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SubmitAnswerDto,
  ) {
    return this.service.submitAnswer(sessionQuestionId, user.id, dto);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: '세션 최종 제출 (채점 집계 + 정답률 캐시 갱신)' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.submit(id, user.id);
  }
}
