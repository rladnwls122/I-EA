import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { VariantsService } from './variants.service';
import { CreateVariantDto } from './dto/create-variant.dto';

@ApiTags('variants')
@ApiBearerAuth()
@Controller()
export class VariantsController {
  constructor(private readonly service: VariantsService) {}

  @Get('questions/:questionId/variants')
  @ApiOperation({ summary: '문제의 변형 관계 조회 (파생/원본 양방향)' })
  list(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.service.listForQuestion(questionId);
  }

  @Post('questions/:questionId/variants')
  @ApiOperation({ summary: '변형 관계 등록 (원본 → 변형)' })
  create(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateVariantDto,
  ) {
    return this.service.create(questionId, user, dto);
  }

  @Delete('variants/:id')
  @ApiOperation({ summary: '변형 관계 삭제 (요청자/ADMIN)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }
}
