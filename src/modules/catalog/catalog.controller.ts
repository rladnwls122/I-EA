import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleType } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { CatalogService } from './catalog.service';
import { CreateSubjectDto, CreateTagDto, CreateUnitDto } from './dto/catalog.dto';

/**
 * 과목/단원/태그 마스터. 조회는 모든 인증 사용자, 생성은 ADMIN/CREATOR로 제한한다.
 */
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  // subjects
  @Get('subjects')
  @ApiOperation({ summary: '과목 목록' })
  listSubjects() {
    return this.service.listSubjects();
  }

  @Post('subjects')
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '과목 생성 (ADMIN)' })
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.service.createSubject(dto);
  }

  // units
  @Get('subjects/:subjectId/units')
  @ApiOperation({ summary: '과목 단원 트리 조회' })
  unitTree(@Param('subjectId', ParseUUIDPipe) subjectId: string) {
    return this.service.unitTree(subjectId);
  }

  @Post('units')
  @Roles(UserRoleType.ADMIN, UserRoleType.CREATOR)
  @ApiOperation({ summary: '단원 생성 (ADMIN/CREATOR)' })
  createUnit(@Body() dto: CreateUnitDto) {
    return this.service.createUnit(dto);
  }

  // tags
  @Get('tags')
  @ApiOperation({ summary: '태그 목록 (category로 필터)' })
  listTags(@Query('category') category?: string) {
    return this.service.listTags(category);
  }

  @Post('tags')
  @Roles(UserRoleType.ADMIN, UserRoleType.CREATOR)
  @ApiOperation({ summary: '태그 생성 (ADMIN/CREATOR)' })
  createTag(@Body() dto: CreateTagDto) {
    return this.service.createTag(dto);
  }
}
