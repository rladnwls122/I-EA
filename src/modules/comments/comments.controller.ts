import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('comments')
@ApiBearerAuth()
@Controller()
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get('questions/:questionId/comments')
  @ApiOperation({ summary: '문제별 댓글 트리 조회 (최신순, 답글 중첩)' })
  list(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.service.listByQuestion(questionId);
  }

  @Post('questions/:questionId/comments')
  @ApiOperation({ summary: '댓글/답글 작성' })
  create(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCommentDto,
  ) {
    return this.service.create(questionId, user.id, dto);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: '댓글 수정 (작성자 본인)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: '댓글 삭제 (작성자 본인, 답글 동반 삭제)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.id);
  }
}
