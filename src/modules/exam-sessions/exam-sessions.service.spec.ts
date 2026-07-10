import { Test } from '@nestjs/testing';
import { ExamSessionsService } from './exam-sessions.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * readChoiceIds는 Json 컬럼(selected_choice_ids)을 읽는 방어 로직이다.
 * DB가 무엇을 담고 있든 선지 분포 카운터를 오염시키지 않아야 한다.
 */
describe('ExamSessionsService.readChoiceIds', () => {
  let read: (raw: unknown) => string[];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [ExamSessionsService, { provide: PrismaService, useValue: {} }],
    }).compile();
    const service = module.get(ExamSessionsService);
    // private 헬퍼 — 분포 집계의 유일한 입력 정제 지점이라 직접 검증한다.
    read = (raw: unknown) => (service as unknown as { readChoiceIds(r: unknown): string[] }).readChoiceIds(raw);
  });

  it('문자열 배열을 그대로 통과시킨다', () => {
    expect(read(['c1', 'c3'])).toEqual(['c1', 'c3']);
  });

  it('중복 선택을 한 번만 센다 (분포 부풀리기 방지)', () => {
    expect(read(['c2', 'c2', 'c2'])).toEqual(['c2']);
  });

  it('배열이 아니면 빈 배열 (null / 객체 / 숫자)', () => {
    expect(read(null)).toEqual([]);
    expect(read(undefined)).toEqual([]);
    expect(read({ c1: true })).toEqual([]);
    expect(read(42)).toEqual([]);
  });

  it('배열 안의 비문자열·빈문자열을 걸러낸다', () => {
    expect(read(['c1', 3, null, '', { id: 'c2' }, 'c4'])).toEqual(['c1', 'c4']);
  });
});
