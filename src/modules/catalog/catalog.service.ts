import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateSubjectDto, CreateTagDto, CreateUnitDto } from './dto/catalog.dto';

/** 마스터 데이터(과목/단원/태그) 관리. 대부분 ADMIN/CREATOR가 편성한다. */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // --- subjects -------------------------------------------------------

  listSubjects() {
    return this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
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

  // --- units (트리) ---------------------------------------------------

  /** 과목의 단원을 평면 조회 후 parent_unit_id 기준으로 트리를 조립한다. */
  async unitTree(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    const units = await this.prisma.unit.findMany({
      where: { subjectId },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }],
    });

    type Node = (typeof units)[number] & { children: Node[] };
    const map = new Map<string, Node>();
    units.forEach((u) => map.set(u.id, { ...u, children: [] }));

    const roots: Node[] = [];
    for (const u of units) {
      const node = map.get(u.id)!;
      if (u.parentUnitId && map.has(u.parentUnitId)) {
        map.get(u.parentUnitId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async createUnit(dto: CreateUnitDto) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
      select: { id: true },
    });
    if (!subject) throw new NotFoundException('과목을 찾을 수 없습니다.');

    // depth는 부모 depth + 1로 자동 계산(최상위=0).
    let depth = 0;
    if (dto.parentUnitId) {
      const parent = await this.prisma.unit.findUnique({
        where: { id: dto.parentUnitId },
        select: { depth: true, subjectId: true },
      });
      if (!parent || parent.subjectId !== dto.subjectId) {
        throw new NotFoundException('부모 단원을 찾을 수 없습니다.');
      }
      depth = parent.depth + 1;
    }

    return this.prisma.unit.create({
      data: {
        subjectId: dto.subjectId,
        parentUnitId: dto.parentUnitId ?? null,
        name: dto.name,
        depth,
        isLeaf: dto.isLeaf ?? false,
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
