import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'AI 문항 생성 요청 (비동기, 202 반환 후 폴링)' })
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

  @Get(':id')
  @ApiOperation({ summary: '생성 작업 상태/산출물 조회' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getGeneration(id);
  }
}
