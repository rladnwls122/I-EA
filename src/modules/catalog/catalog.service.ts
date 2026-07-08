import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateSubjectDto, CreateTagDto } from './dto/catalog.dto';

/** 마스터 데이터(세부과목/태그) 관리. 대부분 ADMIN/CREATOR가 편성한다. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // --- subjects (세부과목) --------------------------------------------

  /** 세부과목 목록. 대분류(examCategory) → 정렬순으로 정렬해 내려준다(프론트가 대분류로 그룹핑). */
  listSubjects() {
    return this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: [{ examCategory: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  createSubject(dto: CreateSubjectDto) {
    return this.prisma.subject.create({
      data: {
        name: dto.name,
        examCategory: dto.examCategory,
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
