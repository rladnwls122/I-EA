import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  batchItemError,
  toBatchResult,
  type BatchItemResult,
  type BatchResult,
} from '@/common/dto/batch-result';
import { validateBatchItems } from '@/common/dto/batch-validation';
import { BatchCreateMediaDto } from './dto/batch-create-media.dto';
import { CreateMediaDto } from './dto/create-media.dto';
import { PresignMediaDto } from './dto/presign-media.dto';
import { S3Service } from './s3.service';

/** 배치에서 귀속 대상 id만 추려낼 때 쓰는 타입 좁히기. */
const isId = (v: string | undefined): v is string => typeof v === 'string' && v.length > 0;

/** media_assets — 이미지(S3 스토리지 URL). 지문 또는 문제 중 하나에만 배타 귀속. */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** S3 presigned POST 발급. 흐름: presign → 클라가 S3에 multipart POST → POST /media-assets 등록. */
  presign(dto: PresignMediaDto) {
    return this.s3.createPresignedPost(dto.contentType, dto.contentLength);
  }

  async create(uploaderId: string, dto: CreateMediaDto) {
    this.assertRegisterable(dto);

    // 귀속 대상 존재 확인
    if (dto.passageId) await this.assertPassageExists(dto.passageId);
    if (dto.questionId) await this.assertQuestionExists(dto.questionId);

    // 같은 그림을 같은 자리에 두 번 등록하면 media_assets에 중복 행만 쌓이고,
    // "이 문항에 매핑된 미디어 목록"에 같은 이미지가 여러 번 뜬다. 등록은 (업로더,
    // URL, 귀속 대상)에 대해 **멱등**이다 — 이미 있으면 그 행을 그대로 돌려준다.
    // (캔버스가 등록 기준선을 잃거나 저장이 중간에 실패해 재시도할 때 실제로 벌어진다.)
    const existing = await this.prisma.mediaAsset.findFirst({
      where: this.identityWhere(uploaderId, dto),
      select: { id: true, assetType: true, storageUrl: true, createdAt: true },
    });
    if (existing) return existing;

    return this.prisma.mediaAsset.create({
      data: {
        uploaderId,
        assetType: dto.assetType,
        storageUrl: dto.storageUrl,
        passageId: dto.passageId ?? null,
        questionId: dto.questionId ?? null,
        generationId: dto.generationId ?? null,
        widthPx: dto.widthPx ?? null,
        heightPx: dto.heightPx ?? null,
      },
      select: { id: true, assetType: true, storageUrl: true, createdAt: true },
    });
  }

  /**
   * 미디어 일괄 등록 (#33 도그푸딩 잔여 3).
   *
   * 항목마다 단건 `create()`를 그대로 부른다 — 배치용 쓰기 경로를 따로 만들면 URL 검증·
   * XOR 규칙·멱등 처리가 한쪽에만 남는 날이 온다(문항 배치와 같은 판단).
   *
   * 다만 **존재 확인만은 앞에서 한 번에** 한다. 이미지 20장이 한 문항에 붙는 저장에서
   * 항목마다 같은 문항을 다시 조회하면 배치가 DB 왕복 N+1이 된다 — HTTP 왕복을 줄이려고
   * 만든 자리에서 그건 앞뒤가 안 맞는다. (그래서 배치 안에서만 알 수 있는 사실 —
   * "이 대상은 아까 확인했다" — 를 캐시로 들고 단건 경로에 넘긴다.)
   */
  async createBatch(uploaderId: string, dto: BatchCreateMediaDto): Promise<BatchResult> {
    const { valid, failures } = validateBatchItems(dto.items, CreateMediaDto);
    const results: BatchItemResult[] = [...failures];

    // 형식이 맞는 항목의 귀속 대상만 모아 한 번에 확인한다.
    const questionIds = [...new Set(valid.map((v) => v.dto.questionId).filter(isId))];
    const passageIds = [...new Set(valid.map((v) => v.dto.passageId).filter(isId))];
    const [questions, passages] = await Promise.all([
      questionIds.length
        ? this.prisma.question.findMany({ where: { id: { in: questionIds } }, select: { id: true } })
        : Promise.resolve([]),
      passageIds.length
        ? this.prisma.passage.findMany({ where: { id: { in: passageIds } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    const knownQuestions = new Set(questions.map((q) => q.id));
    const knownPassages = new Set(passages.map((p) => p.id));

    for (const { index, dto: item } of valid) {
      try {
        this.assertRegisterable(item);
        // 존재 확인은 위에서 끝났다 — 없는 대상은 단건 경로와 같은 404 문구로 떨군다.
        if (item.questionId && !knownQuestions.has(item.questionId)) {
          throw new NotFoundException('문제를 찾을 수 없습니다.');
        }
        if (item.passageId && !knownPassages.has(item.passageId)) {
          throw new NotFoundException('지문을 찾을 수 없습니다.');
        }
        const existing = await this.prisma.mediaAsset.findFirst({
          where: this.identityWhere(uploaderId, item),
          select: { id: true },
        });
        const asset =
          existing ??
          (await this.prisma.mediaAsset.create({
            data: {
              uploaderId,
              assetType: item.assetType,
              storageUrl: item.storageUrl,
              passageId: item.passageId ?? null,
              questionId: item.questionId ?? null,
              generationId: item.generationId ?? null,
              widthPx: item.widthPx ?? null,
              heightPx: item.heightPx ?? null,
            },
            select: { id: true },
          }));
        results.push({ index, status: 'ok', mediaId: asset.id });
      } catch (e) {
        results.push({ index, status: 'failed', error: batchItemError(e) });
      }
    }

    results.sort((a, b) => a.index - b.index);
    return toBatchResult(results);
  }

  /** 등록 가능한 요청인지 — URL 소유·귀속 배타(XOR). 단건·배치가 같은 규칙을 탄다. */
  private assertRegisterable(dto: CreateMediaDto): void {
    // 임의 URL 등록 방지: 우리 버킷/공개 베이스 접두로 시작하지 않으면 400.
    this.s3.assertOwnedPublicUrl(dto.storageUrl);

    // CHECK 제약(지문 XOR 문제) 사전 검증 — DB 에러 대신 명확한 400을 준다.
    if (!!dto.passageId === !!dto.questionId) {
      throw new BadRequestException('passageId 또는 questionId 중 정확히 하나만 지정해야 합니다.');
    }
  }

  /** "같은 등록"의 정의 — 같은 사람이 같은 그림을 같은 자리에 붙인 것. */
  private identityWhere(uploaderId: string, dto: CreateMediaDto) {
    return {
      uploaderId,
      storageUrl: dto.storageUrl,
      questionId: dto.questionId ?? null,
      passageId: dto.passageId ?? null,
    };
  }

  /** 특정 문제/지문에 매핑된 미디어 목록. 둘 중 하나를 쿼리로 지정한다. */
  async listFor(params: { questionId?: string; passageId?: string }) {
    if (!params.questionId && !params.passageId) {
      throw new BadRequestException('questionId 또는 passageId를 지정하세요.');
    }
    return this.prisma.mediaAsset.findMany({
      where: {
        ...(params.questionId ? { questionId: params.questionId } : {}),
        ...(params.passageId ? { passageId: params.passageId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** 업로더 본인만 삭제 가능. */
  async remove(id: string, userId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: { uploaderId: true },
    });
    if (!asset) throw new NotFoundException('미디어를 찾을 수 없습니다.');
    if (asset.uploaderId !== userId) throw new ForbiddenException('업로더 본인만 삭제할 수 있습니다.');

    await this.prisma.mediaAsset.delete({ where: { id } });
    return { id, deleted: true };
  }

  private async assertPassageExists(passageId: string): Promise<void> {
    const p = await this.prisma.passage.findUnique({ where: { id: passageId }, select: { id: true } });
    if (!p) throw new NotFoundException('지문을 찾을 수 없습니다.');
  }

  private async assertQuestionExists(questionId: string): Promise<void> {
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true },
    });
    if (!q) throw new NotFoundException('문제를 찾을 수 없습니다.');
  }
}
