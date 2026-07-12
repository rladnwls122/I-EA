import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { LootBoxesService } from './loot-boxes.service';

@ApiTags('loot-boxes')
@ApiBearerAuth()
@Controller('loot-boxes')
export class LootBoxesController {
  constructor(private readonly service: LootBoxesService) {}

  @Get()
  @ApiOperation({ summary: '내 미개봉 상자 목록' })
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.service.listUnopened(user.id);
  }

  @Post(':id/open')
  @ApiOperation({ summary: '상자 개봉 (코인 획득)' })
  open(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.open(id, user.id);
  }
}
