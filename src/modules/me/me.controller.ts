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

  @Get('wrong-notes')
  @ApiOperation({ summary: '내 오답노트(단원·유형별 집계 + 오답 문항)' })
  wrongNotes(@CurrentUser() user: CurrentUserPayload) {
    return this.service.wrongNotes(user.id);
  }
}
