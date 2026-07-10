import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { TutorService } from './tutor.service';
import { TutorChatDto, TutorHistoryQueryDto } from './dto/tutor-chat.dto';

@ApiTags('tutor')
@ApiBearerAuth()
@Controller('tutor')
export class TutorController {
  constructor(private readonly service: TutorService) {}

  /**
   * 문제 풀이 중 AI 튜터 채팅 → text/event-stream.
   *
   * @Sse()는 GET 전용이라 body를 못 받으므로 @Post + @Res()로 응답을 직접 잡는다.
   * @Res()를 쓰면 Nest 자동 직렬화가 꺼지므로 서비스가 스트림을 직접 닫는다.
   * 인가/레이트 리밋 실패는 헤더 전송 전에 예외로 던져지고 Nest 필터가 상태 코드를 준다.
   */
  @Post('chat')
  @ApiOperation({ summary: 'AI 튜터 채팅 (SSE 스트리밍, 정답 비노출)' })
  chat(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: TutorChatDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.service.chat(user.id, dto, res);
  }

  @Get('history')
  @ApiOperation({ summary: 'AI 튜터 대화 히스토리 조회' })
  history(@CurrentUser() user: CurrentUserPayload, @Query() query: TutorHistoryQueryDto) {
    return this.service.getHistory(user.id, query);
  }
}
