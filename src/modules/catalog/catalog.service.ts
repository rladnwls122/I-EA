import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateSubjectDto, CreateTagDto } from './dto/catalog.dto';

/** 마스터 데이터(세부과목/태그) 관리. 대부분 ADMIN/CREATOR가 편성한다. */
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

  createTag(dto: CreateTagDto) {
    return this.prisma.tag.create({ data: { name: dto.name, category: dto.category } });
  }
}
