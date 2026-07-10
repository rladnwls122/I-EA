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
import { AnnotationsService } from './annotations.service';
import { CreateAnnotationDto } from './dto/create-annotation.dto';
import { UpdateAnnotationDto } from './dto/update-annotation.dto';

@ApiTags('annotations')
@ApiBearerAuth()
@Controller()
export class AnnotationsController {
  constructor(private readonly service: AnnotationsService) {}

  @Get('questions/:questionId/annotations')
  @ApiOperation({ summary: '문항별 내 주석 목록(렌더 재적용용)' })
  list(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.listForQuestion(user.id, questionId);
  }

  @Post('questions/:questionId/annotations')
  @ApiOperation({ summary: '주석 생성 (하이라이트/밑줄 + 태그 + 메모)' })
  create(
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAnnotationDto,
  ) {
    return this.service.create(user.id, questionId, dto);
  }

  @Patch('annotations/:id')
  @ApiOperation({ summary: '주석 수정 (본인)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateAnnotationDto,
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete('annotations/:id')
  @ApiOperation({ summary: '주석 삭제 (본인)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(user.id, id);
  }
}
