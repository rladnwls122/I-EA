import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
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
  @ApiOperation({ summary: '통합 오답노트 (세부과목·유형·원인별 집계 + 오답 문항 + 내 주석)' })
  notes(@CurrentUser() user: CurrentUserPayload) {
    return this.service.notes(user.id);
  }
}
