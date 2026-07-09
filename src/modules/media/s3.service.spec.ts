import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { S3Service } from './s3.service';

// 실제 AWS 서명/네트워크 없이 결정적으로 테스트한다.
jest.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: jest.fn(),
}));

const mockedCreatePresignedPost = createPresignedPost as unknown as jest.Mock;

/** 주어진 env 맵으로 ConfigService를 흉내 낸 S3Service 인스턴스 생성. */
function makeService(env: Record<string, string | undefined>): S3Service {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new S3Service(config);
}

const FULL_ENV = {
  AWS_REGION: 'ap-northeast-2',
  AWS_S3_BUCKET: 'qidea-media',
  AWS_ACCESS_KEY_ID: 'AKIAFAKE',
  AWS_SECRET_ACCESS_KEY: 'secretfake',
};

describe('S3Service', () => {
  beforeEach(() => {
    mockedCreatePresignedPost.mockReset();
    mockedCreatePresignedPost.mockResolvedValue({
      url: 'https://qidea-media.s3.ap-northeast-2.amazonaws.com',
      fields: { key: 'questions/xxx.png', 'Content-Type': 'image/png', Policy: 'base64policy' },
    });
  });

  describe('createPresignedPost', () => {
    it('key는 서버가 만든 uuid 기반이고 클라 입력이 섞이지 않는다', async () => {
      const service = makeService(FULL_ENV);
      const result = await service.createPresignedPost('image/png', 1234);

      expect(result.key).toMatch(
        /^questions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
      );
      expect(result.url).toBe('https://qidea-media.s3.ap-northeast-2.amazonaws.com');
      expect(result.fields).toMatchObject({ 'Content-Type': 'image/png' });
      expect(result.expiresInSec).toBe(300);
      expect(result.publicUrl).toBe(
        `https://qidea-media.s3.ap-northeast-2.amazonaws.com/${result.key}`,
      );
    });

    it('contentType별 확장자를 서버가 정한다 (jpeg → jpg, webp → webp)', async () => {
      const service = makeService(FULL_ENV);
      expect((await service.createPresignedPost('image/jpeg', 10)).key).toMatch(/\.jpg$/);
      expect((await service.createPresignedPost('image/webp', 10)).key).toMatch(/\.webp$/);
    });

    it('Content-Type 정확 일치와 크기 정확 일치를 POST policy conditions로 강제한다', async () => {
      const service = makeService(FULL_ENV);
      const result = await service.createPresignedPost('image/png', 4096);

      expect(mockedCreatePresignedPost).toHaveBeenCalledTimes(1);
      const [, params] = mockedCreatePresignedPost.mock.calls[0];
      expect(params).toMatchObject({
        Bucket: 'qidea-media',
        Key: result.key,
        Fields: { 'Content-Type': 'image/png' },
        Expires: 300,
      });
      expect(params.Conditions).toContainEqual(['eq', '$Content-Type', 'image/png']);
      expect(params.Conditions).toContainEqual(['content-length-range', 4096, 4096]);
    });

    it('AWS_S3_PUBLIC_BASE_URL이 있으면 publicUrl에 그 베이스를 쓴다', async () => {
      const service = makeService({
        ...FULL_ENV,
        AWS_S3_PUBLIC_BASE_URL: 'https://cdn.qidea.io/',
      });
      const result = await service.createPresignedPost('image/png', 10);
      expect(result.publicUrl).toBe(`https://cdn.qidea.io/${result.key}`);
    });

    it('S3 미설정(크레덴셜 없음)이면 503으로 실패한다', async () => {
      const service = makeService({ AWS_REGION: 'ap-northeast-2', AWS_S3_BUCKET: 'qidea-media' });
      await expect(service.createPresignedPost('image/png', 10)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(mockedCreatePresignedPost).not.toHaveBeenCalled();
    });
  });

  describe('assertOwnedPublicUrl', () => {
    it('우리 버킷 접두 URL은 통과한다', () => {
      const service = makeService(FULL_ENV);
      expect(() =>
        service.assertOwnedPublicUrl(
          'https://qidea-media.s3.ap-northeast-2.amazonaws.com/questions/abc.png',
        ),
      ).not.toThrow();
    });

    it('우리 버킷이 아닌 URL은 400', () => {
      const service = makeService(FULL_ENV);
      expect(() => service.assertOwnedPublicUrl('https://evil.example/questions/x.png')).toThrow(
        BadRequestException,
      );
    });

    it('접두를 부분 매칭하는 유사 도메인도 400 (경로 구분자까지 확인)', () => {
      const service = makeService(FULL_ENV);
      // 베이스 접두 + '/' 로 시작해야만 통과하므로 도메인 뒤에 이어붙인 스푸핑은 거부.
      expect(() =>
        service.assertOwnedPublicUrl(
          'https://qidea-media.s3.ap-northeast-2.amazonaws.com.evil.example/x.png',
        ),
      ).toThrow(BadRequestException);
    });

    it('공개 베이스 미설정이면 503', () => {
      const service = makeService({});
      expect(() => service.assertOwnedPublicUrl('https://anything/x.png')).toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
