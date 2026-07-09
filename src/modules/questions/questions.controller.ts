import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionDto } from './dto/query-question.dto';
import { RegenerateChoicesDto } from './dto/regenerate-choices.dto';

@ApiTags('questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionsController {
  constructor(private readonly service: QuestionsService) {}

  @Get()
  @ApiOperation({ summary: '문제 은행 목록/검색 (단원·상태·태그·난이도·키워드 필터)' })
  list(@Query() query: QueryQuestionDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '문제 상세 조회 (콘텐츠·태그·정답률 포함)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Get(':id/stats')
  @Public()
  @ApiOperation({ summary: '문항 통계 — 선지별 분포 / 정답률 / 평균 풀이시간 (인증 불필요)' })
  stats(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getStats(id);
  }

  @Post(':id/choices/regenerate')
  @ApiOperation({
    summary: 'AI 선지 재생성 (작성자 본인). 정답 포함 전체 재생성이며 저장하지 않는다',
  })
  regenerateChoices(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegenerateChoicesDto,
  ) {
    return this.service.regenerateChoices(id, user.id, dto);
  }

  @Post()
  @ApiOperation({ summary: '문제 직접 생성 (DRAFT 상태로 저장)' })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateQuestionDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '문제 수정 (작성자 본인)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '문제 발행 (PUBLISHED 전환)' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.publish(id, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: '문제 보관(소프트 삭제, ARCHIVED)' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.archive(id, user.id);
  }
}
