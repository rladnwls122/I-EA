import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateMediaDto } from './dto/create-media.dto';
import { PresignMediaDto } from './dto/presign-media.dto';
import { S3Service } from './s3.service';

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
    // 임의 URL 등록 방지: 우리 버킷/공개 베이스 접두로 시작하지 않으면 400.
    this.s3.assertOwnedPublicUrl(dto.storageUrl);

    // CHECK 제약(지문 XOR 문제) 사전 검증 — DB 에러 대신 명확한 400을 준다.
    const boundToPassage = !!dto.passageId;
    const boundToQuestion = !!dto.questionId;
    if (boundToPassage === boundToQuestion) {
      throw new BadRequestException('passageId 또는 questionId 중 정확히 하나만 지정해야 합니다.');
    }

    // 귀속 대상 존재 확인
    if (dto.passageId) await this.assertPassageExists(dto.passageId);
    if (dto.questionId) await this.assertQuestionExists(dto.questionId);

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
