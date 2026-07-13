import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRoleType } from '@prisma/client';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { RolesGuard } from '@/modules/auth/roles.guard';
import { CatalogService } from './catalog.service';
import { CreateSubjectDto, CreateTagDto } from './dto/catalog.dto';

/**
 * 분류/태그 마스터. 조회는 모든 인증 사용자. 소분류 생성은 ADMIN 전용.
 * 태그 생성은 카테고리에 따라 갈린다 — "키워드"는 모든 유저, 그 외 큐레이션
 * 카테고리는 ADMIN/CREATOR만(서비스 계층에서 분기, catalog.service 참고).
 * (단원 트리는 MVP에서 제거 — 문제는 3단 분류의 리프[subjects]에 직접 분류된다.)
 */
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  // subjects (세부과목)
  @Get('subjects')
  @Public()
  @ApiOperation({ summary: '소분류 목록 (시험 examType · 대분류 examCategory 포함, 인증 불필요)' })
  listSubjects() {
    return this.service.listSubjects();
  }

  @Post('subjects')
  @Roles(UserRoleType.ADMIN)
  @ApiOperation({ summary: '소분류 생성 (ADMIN)' })
  createSubject(@Body() dto: CreateSubjectDto) {
    return this.service.createSubject(dto);
  }

  // tags
  @Get('tags')
  @Public()
  @ApiOperation({ summary: '태그 목록 (category로 필터, 인증 불필요)' })
  listTags(@Query('category') category?: string) {
    return this.service.listTags(category);
  }

  @Post('tags')
  @ApiOperation({ summary: '태그 생성 ("키워드" 카테고리는 모든 유저, 그 외는 ADMIN/CREATOR)' })
  createTag(@Body() dto: CreateTagDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.createTag(dto, user);
  }
}
