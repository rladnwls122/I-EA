import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { AiGenerationService } from './ai-generation.service';
import { CreateGenerationDto } from './dto/create-generation.dto';

@ApiTags('ai-generations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai-generations')
export class AiGenerationController {
  constructor(private readonly service: AiGenerationService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'AI 문항 생성 요청 (비동기, 202 반환 후 폴링)' })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGenerationDto) {
    return this.service.createGeneration(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '생성 작업 상태/산출물 조회' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getGeneration(id);
  }
}
