import {
  buildSessionAxisReport,
  AxisReportItem,
  AxisReportQuestionMeta,
  KEYWORD_AXIS_CAP,
} from './session-report.util';

const item = (over: Partial<AxisReportItem> & { questionId: string }): AxisReportItem => ({
  difficulty: 3,
  isCorrect: true,
  ...over,
});

describe('buildSessionAxisReport — 세션 결과 축별 집계', () => {
  it('난이도·키워드·하위요소 축을 정오로 접는다', () => {
    const meta = new Map<string, AxisReportQuestionMeta>([
      ['q1', { detail: { id: 'd1', name: '현대시' }, keywords: [{ id: 'k1', name: '화자' }] }],
      ['q2', { detail: { id: 'd1', name: '현대시' }, keywords: [{ id: 'k1', name: '화자' }] }],
      ['q3', { detail: { id: 'd2', name: '고전산문' }, keywords: [{ id: 'k2', name: '서술자' }] }],
    ]);
    const report = buildSessionAxisReport(
      [
        item({ questionId: 'q1', difficulty: 2, isCorrect: true }),
        item({ questionId: 'q2', difficulty: 2, isCorrect: false }),
        item({ questionId: 'q3', difficulty: 4, isCorrect: false }),
      ],
      meta,
    );
    expect(report.graded).toBe(3);
    expect(report.ungraded).toBe(0);
    expect(report.byDifficulty).toEqual([
      { difficulty: 2, total: 2, correct: 1 },
      { difficulty: 4, total: 1, correct: 0 },
    ]);
    expect(report.bySubjectDetail).toEqual([
      { key: 'd1', label: '현대시', total: 2, correct: 1 },
      { key: 'd2', label: '고전산문', total: 1, correct: 0 },
    ]);
    expect(report.byKeyword.map((k) => k.key)).toEqual(['k1', 'k2']);
  });

  it('미채점(null)은 정오 어느 쪽으로도 세지 않고 ungraded로만 센다', () => {
    const report = buildSessionAxisReport(
      [
        item({ questionId: 'q1', isCorrect: null }),
        item({ questionId: 'q2', isCorrect: true }),
      ],
      new Map(),
    );
    expect(report.graded).toBe(1);
    expect(report.ungraded).toBe(1);
    expect(report.byDifficulty).toEqual([{ difficulty: 3, total: 1, correct: 1 }]);
  });

  it('원본 문항이 삭제돼 메타가 없으면 난이도 축(스냅샷 출처)에만 잡힌다', () => {
    const report = buildSessionAxisReport(
      [item({ questionId: 'gone', isCorrect: false })],
      new Map(),
    );
    expect(report.byDifficulty).toEqual([{ difficulty: 3, total: 1, correct: 0 }]);
    expect(report.byKeyword).toEqual([]);
    expect(report.bySubjectDetail).toEqual([]);
  });

  it('정렬은 오답 많은 순 — 득점률 낮은 축이 먼저 보인다', () => {
    const meta = new Map<string, AxisReportQuestionMeta>([
      ['q1', { keywords: [{ id: 'ok', name: '다맞음' }] }],
      ['q2', { keywords: [{ id: 'bad', name: '다틀림' }] }],
      ['q3', { keywords: [{ id: 'bad', name: '다틀림' }] }],
    ]);
    const report = buildSessionAxisReport(
      [
        item({ questionId: 'q1', isCorrect: true }),
        item({ questionId: 'q2', isCorrect: false }),
        item({ questionId: 'q3', isCorrect: false }),
      ],
      meta,
    );
    expect(report.byKeyword.map((k) => k.key)).toEqual(['bad', 'ok']);
  });

  it('키워드 축은 상한을 넘기지 않는다', () => {
    const meta = new Map<string, AxisReportQuestionMeta>([
      [
        'q1',
        {
          keywords: Array.from({ length: KEYWORD_AXIS_CAP + 5 }, (_, i) => ({
            id: `k${i}`,
            name: `키워드${i}`,
          })),
        },
      ],
    ]);
    const report = buildSessionAxisReport([item({ questionId: 'q1', isCorrect: false })], meta);
    expect(report.byKeyword).toHaveLength(KEYWORD_AXIS_CAP);
  });
});
