import { randomUUID } from 'crypto';
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import {
  AllowedImageContentType,
  CONTENT_TYPE_EXTENSIONS,
  PRESIGN_EXPIRES_SEC,
} from './media.constants';

export interface PresignResult {
  /** multipart POST 대상 S3 엔드포인트. PUT 아님. */
  url: string;
  /** POST policy 필드. 전부 FormData에 넣고 마지막에 file을 append 해야 한다. */
  fields: Record<string, string>;
  key: string;
  publicUrl: string;
  expiresInSec: number;
}

/**
 * S3 presigned POST 발급 + 우리 버킷 소유 URL 검증 담당.
 *
 * **왜 PUT이 아니라 POST인가:** presigned PUT은 Content-Type을 서명에 강제할 수 없다
 * (@aws-sdk/s3-request-presigner가 content-type을 unsignableHeaders로 무조건 제외).
 * 그러면 클라가 화이트리스트를 우회해 text/html로 올려 public-read 버킷에서 저장형 XSS가 된다.
 * presigned POST는 policy conditions로 Content-Type과 크기를 **서버측에서** 강제하므로 안전하다.
 *
 * env(ConfigModule 전역): AWS_REGION / AWS_S3_BUCKET / AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY, 선택 AWS_S3_PUBLIC_BASE_URL(CloudFront 등).
 *
 * **부팅 정책은 GEMINI_API_KEY 와 동일하다**: 키가 없어도 앱 부팅은 막지 않고,
 * presign 을 실제로 호출하는 시점에 503(ServiceUnavailable)으로 실패한다.
 * S3Client 는 설정이 갖춰졌을 때 생성자에서 **1회만** 만들어 재사용한다.
 */
@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly region: string;
  private readonly bucket: string;
  /** 정규화된 public URL 접두(끝 슬래시 제거). 미설정이면 빈 문자열. */
  private readonly publicBaseUrl: string;
  /** 설정이 갖춰졌을 때만 생성된다. 미설정이면 null → 호출 시 503. */
  private readonly client: S3Client | null;

  constructor(private readonly config: ConfigService) {
    this.region = this.config.get<string>('AWS_REGION') ?? '';
    this.bucket = this.config.get<string>('AWS_S3_BUCKET') ?? '';
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY') ?? '';

    // publicUrl 베이스: 명시 base(CloudFront 등)가 있으면 그걸, 없으면 버킷/리전 규칙으로.
    // 크레덴셜과 무관하게 계산되므로, presign 이 불가능해도 URL 소유 검증에는 쓸 수 있다.
    const explicitBase = (this.config.get<string>('AWS_S3_PUBLIC_BASE_URL') ?? '').trim();
    const derivedBase =
      this.bucket && this.region
        ? `https://${this.bucket}.s3.${this.region}.amazonaws.com`
        : '';
    this.publicBaseUrl = (explicitBase || derivedBase).replace(/\/+$/, '');

    if (this.region && this.bucket && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: this.region,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn(
        'S3 설정(AWS_REGION/AWS_S3_BUCKET/AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)이 ' +
          '완전하지 않습니다. presign 호출은 503으로 실패합니다.',
      );
    }
  }

  /**
   * 이미지 업로드용 presigned POST(policy) 를 발급한다.
   * conditions 로 Content-Type 정확 일치와 크기 정확 일치를 **서버측에서 강제**하므로,
   * 클라가 다른 타입/크기로 올리면 S3가 거부한다.
   * object key 는 서버가 randomUUID 로 만들어 클라 파일명이 섞이지 않는다.
   * 클라는 반환된 fields 를 전부 FormData에 넣고 마지막에 file 을 append 한 뒤 url 로 multipart POST 한다.
   */
  async createPresignedPost(
    contentType: AllowedImageContentType,
    contentLength: number,
  ): Promise<PresignResult> {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException('S3가 설정되지 않아 업로드 URL을 발급할 수 없습니다.');
    }

    const ext = CONTENT_TYPE_EXTENSIONS[contentType];
    const key = `questions/${randomUUID()}.${ext}`;

    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['eq', '$Content-Type', contentType],
        // 정확히 그 바이트 수만 허용 (min == max). 클라가 준 contentLength 를 그대로 강제한다.
        ['content-length-range', contentLength, contentLength],
      ],
      Fields: { 'Content-Type': contentType },
      Expires: PRESIGN_EXPIRES_SEC,
    });

    return {
      url,
      fields,
      key,
      publicUrl: this.buildPublicUrl(key),
      expiresInSec: PRESIGN_EXPIRES_SEC,
    };
  }

  /** object key → 공개 접근 URL. 버킷은 public-read 전제. */
  private buildPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  /**
   * 등록되는 storageUrl 이 우리 버킷/공개 베이스 접두로 시작하는지 검증한다.
   * 임의 URL 등록(SSRF·스팸)을 막는다. 접두 미설정이면 발급 자체가 불가하므로 503.
   */
  assertOwnedPublicUrl(url: string): void {
    if (!this.publicBaseUrl) {
      throw new ServiceUnavailableException(
        'S3 공개 URL 베이스가 설정되지 않아 미디어 URL을 검증할 수 없습니다.',
      );
    }
    // 접두 뒤 '/' 까지 요구하는 게 보안 핵심이다. 이게 없으면
    // `https://our-bucket.s3...amazonaws.com.evil.example/x` 같은 유사 도메인이 뚫린다.
    // 나중에 이 '/' 를 지우지 마라.
    if (!url.startsWith(`${this.publicBaseUrl}/`)) {
      throw new BadRequestException('허용된 스토리지 버킷의 URL만 등록할 수 있습니다.');
    }
  }
}
