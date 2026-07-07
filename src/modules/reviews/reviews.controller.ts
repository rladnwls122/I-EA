import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { ReviewsService } from './reviews.service';
import { UpsertReviewDto } from './dto/upsert-review.dto';

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Get('questions/:questionId/reviews')
  @ApiOperation({ summary: '문제별 리뷰 목록 + 평점 요약' })
  list(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.service.listByQuestion(questionId);
  }

  @Put('questions/:questionId/reviews')
  @ApiOperation({ summary: '내 리뷰 등록/수정 (사용자당 1건 upsert)' })
  upsert(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpsertReviewDto,
  ) {
    return this.service.upsert(questionId, user.id, dto);
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: '내 리뷰 삭제' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.id);
  }
}
