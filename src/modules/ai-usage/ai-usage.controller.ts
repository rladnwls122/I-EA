import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleType } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { AiUsageService } from './ai-usage.service';
import { QueryUsageDto } from './dto/query-usage.dto';

/** 내 AI 사용량 — 사용자가 자기 소비를 볼 수 있어야 상한도 납득한다. */
@ApiTags('ai-usage')
@ApiBearerAuth()
@Controller('me/ai-usage')
export class MyAiUsageController {
  constructor(private readonly service: AiUsageService) {}

  @Get()
  @ApiOperation({ summary: '내 AI 사용량 (기간 합계 + 기능별 + 일자별)' })
  mine(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryUsageDto) {
    return this.service.forUser(user.id, query.days);
  }
}

/**
 * 운영 원가 대시보드. ADMIN 전용 — 상위 사용자 목록에 이메일이 실리므로
 * 일반 사용자에게는 열지 않는다.
 */
@ApiTags('admin-ai-usage')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('admin/ai-usage')
export class AdminAiUsageController {
  constructor(private readonly service: AiUsageService) {}

  @Get()
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '전체 AI 원가 집계 (기간·기능·일자별 + 상위 소비 사용자)' })
  all(@Query() query: QueryUsageDto) {
    return this.service.forAdmin(query.days);
  }
}
