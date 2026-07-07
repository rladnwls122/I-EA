import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PassageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginatedResult } from '@/common/dto/pagination.dto';
import { CreatePassageDto } from './dto/create-passage.dto';
import { UpdatePassageDto } from './dto/update-passage.dto';
import { QueryPassageDto } from './dto/query-passage.dto';

// Json 컬럼 쓰기용 국소 캐스팅.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonWritable = any;

/** passages — 독해/세트 문항용 지문. 상태 흐름은 DRAFT → PUBLISHED → ARCHIVED. */
@Injectable()
export class PassagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryPassageDto): Promise<PaginatedResult<unknown>> {
    const where: Prisma.PassageWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.creatorId ? { creatorId: query.creatorId } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.passage.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          creatorId: true,
          generationId: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { questions: true } },
        },
      }),
      this.prisma.passage.count({ where }),
    ]);

    return { items, total, page: query.page, limit: query.limit };
  }

  async getById(id: string) {
    const passage = await this.prisma.passage.findUnique({
      where: { id },
      include: {
        questions: { select: { id: true, questionType: true, status: true } },
        mediaAssets: { select: { id: true, assetType: true, storageUrl: true } },
      },
    });
    if (!passage) throw new NotFoundException('지문을 찾을 수 없습니다.');
    return passage;
  }

  async create(creatorId: string, dto: CreatePassageDto) {
    return this.prisma.passage.create({
      data: {
        creatorId,
        content: dto.content as JsonWritable,
        status: 'DRAFT',
      },
      select: { id: true, status: true, createdAt: true },
    });
  }

  async update(id: string, userId: string, dto: UpdatePassageDto) {
    await this.assertOwner(id, userId);
    return this.prisma.passage.update({
      where: { id },
      data: {
        ...(dto.content !== undefined ? { content: dto.content as JsonWritable } : {}),
      },
      select: { id: true, updatedAt: true },
    });
  }

  async setStatus(id: string, userId: string, status: PassageStatus) {
    await this.assertOwner(id, userId);
    return this.prisma.passage.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
  }

  private async assertOwner(id: string, userId: string): Promise<void> {
    const passage = await this.prisma.passage.findUnique({
      where: { id },
      select: { creatorId: true },
    });
    if (!passage) throw new NotFoundException('지문을 찾을 수 없습니다.');
    if (passage.creatorId !== userId) throw new ForbiddenException('본인 지문만 수정할 수 있습니다.');
  }
}
