import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { TutorService } from './tutor.service';
import { ReviewTutorChatDto, ReviewTutorHistoryQueryDto } from './dto/tutor-chat.dto';

@ApiTags('tutor')
@ApiBearerAuth()
@Controller('tutor')
export class TutorController {
  constructor(private readonly service: TutorService) {}

  /**
   * 오답 복습 코치 채팅 (#40) → text/event-stream.
   *
   * 채점이 끝난 뒤에만 열린다. 풀이 중 튜터는 계획이 무효화돼 제거됐고(2026-08-04),
   * 이 모듈에 남은 유일한 대화 기능이다.
   */
  @Post('review-chat')
  @ApiOperation({
    summary: '오답 복습 AI 코치 채팅 (SSE 스트리밍, 정답 설명 허용)',
    description:
      '본인이 제출한 시험에서 직접 푼 문항만 가능하다. 그 문항이 포함된 시험을 지금 ' +
      '응시 중이면 거절한다(응시 중 정답 마스킹 우회 차단). 레이트리밋 (사용자,문항)당 시간당 30회.',
  })
  reviewChat(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReviewTutorChatDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.service.reviewChat(user.id, dto, res);
  }

  @Get('review-history')
  @ApiOperation({ summary: '오답 복습 코치 대화 히스토리 조회' })
  reviewHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ReviewTutorHistoryQueryDto,
  ) {
    return this.service.getReviewHistory(user.id, query);
  }
}
