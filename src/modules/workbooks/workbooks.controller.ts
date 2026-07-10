import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { WorkbooksService } from './workbooks.service';
import {
  AddQuestionDto,
  CreateWorkbookDto,
  QueryWorkbookDto,
  ReorderQuestionsDto,
  UpdateWorkbookDto,
} from './dto/workbook.dto';

/**
 * 문제집 — 탐색 / Pick & Mix / 포킹.
 * 조회도 인증이 필요하다(전역 JwtAuthGuard). 목록은 PUBLIC + 내 문제집만 노출한다.
 */
@ApiTags('workbooks')
@ApiBearerAuth()
@Controller('workbooks')
export class WorkbooksController {
  constructor(private readonly service: WorkbooksService) {}

  @Get()
  @ApiOperation({ summary: '문제집 탐색 (PUBLIC + 내 문제집, 3단 분류 필터)' })
  list(@Query() dto: QueryWorkbookDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.list(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '문제집 상세 + 문항 리스트 (조회수 증가)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: '문제집 생성 (questionIds로 장바구니 일괄 담기)' })
  create(@Body() dto: CreateWorkbookDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '문제집 수정 (PUBLIC 전환 시 publishedAt 기록)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkbookDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '문제집 삭제' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.id);
  }

  @Post(':id/fork')
  @ApiOperation({ summary: '문제집 통째 포크 (사본은 PRIVATE)' })
  fork(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.fork(id, user.id);
  }

  @Post(':id/start')
  @ApiOperation({
    summary: '문제집 바로 풀기. 발행된 문항만 담고 제외된 문항을 skippedQuestionIds로 알린다',
  })
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.startSession(id, user.id);
  }

  @Put(':id/questions/order')
  @ApiOperation({ summary: '문항 순서 재배열 (전체 순서를 통째로 전송)' })
  reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.reorderQuestions(id, dto.questionIds, user.id);
  }

  @Post(':id/questions')
  @ApiOperation({ summary: '문항 담기 (Pick). 발행된 문항만 가능' })
  addQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddQuestionDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addQuestion(id, dto, user.id);
  }

  @Delete(':id/questions/:questionId')
  @ApiOperation({ summary: '문제집에서 문항 빼기' })
  removeQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeQuestion(id, questionId, user.id);
  }
}
