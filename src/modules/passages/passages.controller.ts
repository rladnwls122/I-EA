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
import { PassageStatus } from '@prisma/client';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { PassagesService } from './passages.service';
import { CreatePassageDto } from './dto/create-passage.dto';
import { UpdatePassageDto } from './dto/update-passage.dto';
import { QueryPassageDto } from './dto/query-passage.dto';

@ApiTags('passages')
@ApiBearerAuth()
@Controller('passages')
export class PassagesController {
  constructor(private readonly service: PassagesService) {}

  @Get()
  @ApiOperation({ summary: '지문 목록 (상태·작성자 필터)' })
  list(@Query() query: QueryPassageDto) {
    return this.service.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '지문 상세 (연결 문항·미디어 포함)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({ summary: '지문 생성 (DRAFT)' })
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreatePassageDto) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: '지문 수정 (작성자 본인)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdatePassageDto,
  ) {
    return this.service.update(id, user.id, dto);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: '지문 발행 (PUBLISHED)' })
  publish(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setStatus(id, user.id, PassageStatus.PUBLISHED);
  }

  @Delete(':id')
  @ApiOperation({ summary: '지문 보관 (소프트 삭제, ARCHIVED)' })
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.setStatus(id, user.id, PassageStatus.ARCHIVED);
  }
}
