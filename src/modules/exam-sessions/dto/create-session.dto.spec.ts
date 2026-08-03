import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateSessionDto, SESSION_MAX_QUESTIONS } from './create-session.dto';

/** 전역 ValidationPipe와 동일한 규칙(whitelist/forbidNonWhitelisted)으로 검증. */
function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSessionDto, payload);
  return validateSync(dto as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

/** 유효한 UUID v4 n개. */
function uuids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const tail = i.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${tail}`;
  });
}

// 제출 트랜잭션이 문항 수만큼 순차 DB 왕복을 도는 구조라, 상한 없는 플레이리스트는
// 오답노트 복습(수백 문항)에서 트랜잭션 타임아웃(P2028)으로 이어진다.
describe('CreateSessionDto — 플레이리스트 문항 수 상한', () => {
  it(`${SESSION_MAX_QUESTIONS}문항까지는 통과한다`, () => {
    expect(validate({ questionIds: uuids(SESSION_MAX_QUESTIONS), isReview: true })).toHaveLength(0);
  });

  it(`${SESSION_MAX_QUESTIONS + 1}문항은 거부한다`, () => {
    const errors = validate({ questionIds: uuids(SESSION_MAX_QUESTIONS + 1) });
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('최대');
  });

  it('필터 모드의 questionCount도 같은 상한을 쓴다', () => {
    const ok = validate({
      subjectId: '00000000-0000-4000-8000-000000000001',
      questionCount: SESSION_MAX_QUESTIONS,
    });
    expect(ok).toHaveLength(0);
    const over = validate({
      subjectId: '00000000-0000-4000-8000-000000000001',
      questionCount: SESSION_MAX_QUESTIONS + 1,
    });
    expect(over.length).toBeGreaterThan(0);
  });
});
