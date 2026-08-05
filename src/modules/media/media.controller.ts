import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { MediaService } from './media.service';
import { MEDIA_BATCH_MAX } from './media.constants';
import { BatchCreateMediaDto } from './dto/batch-create-media.dto';
import { CreateMediaDto } from './dto/create-media.dto';
import { PresignMediaDto } from './dto/presign-media.dto';

class ListMediaQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  questionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  passageId?: string;
}

@ApiTags('media')
@ApiBearerAuth()
@Controller('media-assets')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Get()
  @ApiOperation({ summary: '문제/지문에 매핑된 미디어 목록' })
  list(@Query() query: ListMediaQuery) {
    return this.service.listFor(query);
  }

  @Post('presign')
  @ApiOperation({
    summary: 'S3 presigned POST 발급 (이미지 직접 업로드용)',
    description:
      '응답의 fields를 전부 FormData에 넣고 마지막에 file을 append 한 뒤 url로 multipart POST 한다. ' +
      'PUT이 아니다 — PUT으로 시도하면 실패한다. Content-Type과 파일 크기는 POST policy로 서버가 강제한다.',
  })
  presign(@Body() dto: PresignMediaDto) {
    return this.service.presign(dto);
  }

  @Post()
  @ApiOperation({
    summary: '미디어 자원 등록 (지문 XOR 문제 배타 매핑)',
    description:
      '같은 URL을 같은 대상에 다시 등록하면 새 행을 만들지 않고 기존 행을 돌려준다(멱등).',
  })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMediaDto) {
    return this.service.create(user.id, dto);
  }

  @Post('batch')
  @ApiOperation({
    summary: '미디어 자원 일괄 등록',
    description:
      `한 번에 최대 ${MEDIA_BATCH_MAX}건. 결과는 **항목별**(index·status·mediaId·error)로 돌아오며, ` +
      '항목 하나가 실패해도 나머지는 등록된다. 등록은 단건과 같이 멱등이다.',
  })
  createBatch(@CurrentUser() user: CurrentUserPayload, @Body() dto: BatchCreateMediaDto) {
    return this.service.createBatch(user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '미디어 삭제 (업로더 본인)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.id);
  }
}
