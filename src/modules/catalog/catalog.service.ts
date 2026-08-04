import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { KEYWORD_TAG_CATEGORY } from '@/common/constants/question';
import { CurrentUserPayload } from '@/modules/auth/current-user.interface';
import { CreateSubjectDto, CreateTagDto } from './dto/catalog.dto';

/** 마스터 데이터(세부과목/태그) 관리. 큐레이션 태그는 ADMIN/CREATOR가 편성한다. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // --- subjects (세부과목) --------------------------------------------

  /**
   * 3단 분류 리프 목록. 시험(examType) → 대분류(examCategory) → 정렬순.
   * 프론트가 이 순서 그대로 Cascading 필터(시험 → 대분류 → 소분류)를 그린다.
   */
  listSubjects() {
    return this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: [{ examType: 'asc' }, { examCategory: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  createSubject(dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        examType: dto.examType,
        examCategory: dto.examCategory,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  // --- tags -----------------------------------------------------------

  listTags(category?: string) {
    return this.prisma.tag.findMany({
      where: category ? { category } : {},
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * "키워드" 카테고리는 모든 인증 유저가 자유 태깅용으로 생성할 수 있다(문항/문제집
   * #키워드). 그 외 카테고리(과목·난이도 등 큐레이션)는 ADMIN/CREATOR만 — 컨트롤러의
   * @Roles 데코레이터로는 카테고리별 분기를 표현할 수 없어 여기서 직접 막는다.
   */
  createTag(dto: CreateTagDto, user: CurrentUserPayload) {
    if (dto.category !== KEYWORD_TAG_CATEGORY) {
      const allowed = user.roles.some((r) => r === UserRoleType.ADMIN || r === UserRoleType.CREATOR);
      if (!allowed) throw new ForbiddenException('이 카테고리의 태그는 ADMIN/CREATOR만 생성할 수 있습니다.');
    }
    // (category, name)이 유니크이므로 upsert로 멱등하게 만든다.
    // find-then-create는 동시 요청에서 둘 다 조회를 미스해 한쪽이 P2002로 터진다.
    return this.prisma.tag.upsert({
      where: { category_name: { category: dto.category, name: dto.name } },
      update: {},
      create: { name: dto.name, category: dto.category },
    });
  }
}
