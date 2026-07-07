import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { PaginationQueryDto } from '@/common/dto/pagination.dto';
import { MemosService } from './memos.service';
import { UpsertMemoDto } from './dto/upsert-memo.dto';

@ApiTags('memos')
@ApiBearerAuth()
@Controller()
export class MemosController {
  constructor(private readonly service: MemosService) {}

  @Get('me/memos')
  @ApiOperation({ summary: '내 메모 목록 (최근 수정순)' })
  listMine(@CurrentUser() user: CurrentUserPayload, @Query() query: PaginationQueryDto) {
    return this.service.listMine(user.id, query);
  }

  @Get('questions/:questionId/memo')
  @ApiOperation({ summary: '특정 문제에 대한 내 메모 조회' })
  get(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getForQuestion(user.id, questionId);
  }

  @Put('questions/:questionId/memo')
  @ApiOperation({ summary: '내 메모 저장/수정 (upsert)' })
  upsert(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertMemoDto,
  ) {
    return this.service.upsert(user.id, questionId, dto);
  }

  @Delete('questions/:questionId/memo')
  @ApiOperation({ summary: '내 메모 삭제' })
  remove(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(user.id, questionId);
  }
}
