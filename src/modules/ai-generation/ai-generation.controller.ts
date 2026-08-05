import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AI_GENERATION_THROTTLE } from '@/common/throttler/throttler.config';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { AiGenerationService } from './ai-generation.service';
import { AuthoringChatService } from './authoring-chat.service';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { AuthoringChatDto } from './dto/authoring-chat.dto';

@ApiTags('ai-generations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-generations')
export class AiGenerationController {
  constructor(
    private readonly service: AiGenerationService,
    private readonly authoringChat: AuthoringChatService,
  ) {}

  @Post()
  @HttpCode(202)
  @Throttle({ default: AI_GENERATION_THROTTLE })
  @ApiOperation({
    summary: 'AI 문항 생성 요청 (비동기, 202 반환 후 폴링)',
    description: '레이트리밋: 1시간 30건. 잡 하나가 Gemini 호출 비용을 유발한다.',
  })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGenerationDto) {
    return this.service.createGeneration(user.id, dto);
  }

  @Post('chat')
  @ApiOperation({ summary: '출제 도우미 멀티턴 채팅 (SSE 스트리밍)' })
  chat(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AuthoringChatDto,
    @Res() res: Response,
  ): Promise<void> {
    return this.authoringChat.chat(user.id, dto, res);
  }

  // ⚠ ':id' 라우트보다 먼저 선언해야 'templates'가 UUID 파라미터로 오인되지 않는다.
  @Get('templates')
  @ApiOperation({ summary: '출제 형식 템플릿 목록 (examType으로 필터, #43)' })
  templates(@Query('examType') examType?: string) {
    return this.service.listFormatTemplates(examType);
  }

  // ⚠ ':id'보다 먼저. 아래 라우트가 UUID 파이프를 달고 있어 순서가 뒤바뀌면 400이 난다.
  @Get('review-stats')
  @ApiOperation({
    summary: 'AI 자기검증 판정 집계 (본인 문항, #33)',
    description:
      'PASS/REVISE/ERROR 건수와 REVISE 비율은 전 기간 정확. 축 분해·일자별 추이는 최근 2000건 표본.',
  })
  reviewStats(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getReviewStats(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: '생성 작업 상태/산출물 조회 (요청자 본인 작업만)' })
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.getGeneration(id, user.id);
  }
}
