import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { QueryNotesDto } from './dto/query-notes.dto';
import { MeService } from './me.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly service: MeService) {}

  @Get('exam-sessions')
  @ApiOperation({ summary: '내 제출 세션(풀이기록)' })
  sessions(@CurrentUser() user: CurrentUserPayload) {
    return this.service.examSessions(user.id);
  }

  @Get('notes')
  @ApiOperation({ summary: '통합 오답노트 (시험·과목·세부과목 필터 + 원인별 집계 + 오답 문항 + 내 주석)' })
  notes(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryNotesDto) {
    return this.service.notes(user.id, query);
  }

  @Get('xp/history')
  @ApiOperation({ summary: 'XP 적립 원장 (최신순, 페이지네이션)' })
  xpHistory(@CurrentUser() user: CurrentUserPayload, @Query() query: PaginationQueryDto) {
    return this.service.xpHistory(user.id, query);
  }

  @Get('milestones')
  @ApiOperation({ summary: '마일스톤 대시보드 (진행률·의존성·달성 이력)' })
  milestones(@CurrentUser() user: CurrentUserPayload) {
    return this.service.milestones(user.id);
  }
}
