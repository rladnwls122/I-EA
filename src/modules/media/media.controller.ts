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
  @ApiOperation({ summary: '미디어 자원 등록 (지문 XOR 문제 배타 매핑)' })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateMediaDto) {
    return this.service.create(user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '미디어 삭제 (업로더 본인)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.id);
  }
}
