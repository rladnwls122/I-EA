import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_UPLOAD_BYTES } from '../media.constants';
import { PresignMediaDto } from './presign-media.dto';

/** 전역 ValidationPipe와 동일한 규칙(whitelist/forbidNonWhitelisted)으로 검증. */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(PresignMediaDto, payload);
  return validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('PresignMediaDto', () => {
  it('허용된 contentType + 유효한 크기는 통과한다', () => {
    expect(validate({ contentType: 'image/png', contentLength: 1024 })).toHaveLength(0);
    expect(validate({ contentType: 'image/jpeg', contentLength: MAX_UPLOAD_BYTES })).toHaveLength(0);
    expect(validate({ contentType: 'image/webp', contentLength: 1 })).toHaveLength(0);
  });

  it('화이트리스트 밖 contentType은 거부한다', () => {
    expect(validate({ contentType: 'image/gif', contentLength: 1024 }).length).toBeGreaterThan(0);
    expect(
      validate({ contentType: 'application/pdf', contentLength: 1024 }).length,
    ).toBeGreaterThan(0);
  });

  it('contentLength 0은 거부한다 (빈 파일)', () => {
    expect(validate({ contentType: 'image/png', contentLength: 0 }).length).toBeGreaterThan(0);
  });

  it('contentLength가 5MB를 넘으면 거부한다', () => {
    expect(
      validate({ contentType: 'image/png', contentLength: MAX_UPLOAD_BYTES + 1 }).length,
    ).toBeGreaterThan(0);
  });

  it('선언되지 않은 필드는 거부한다 (forbidNonWhitelisted)', () => {
    expect(
      validate({ contentType: 'image/png', contentLength: 1024, filename: 'evil.png' }).length,
    ).toBeGreaterThan(0);
  });
});
