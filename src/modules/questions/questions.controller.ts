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
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionDto } from './dto/query-question.dto';

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
