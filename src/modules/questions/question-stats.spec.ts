import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { PrismaService } from '@/prisma/prisma.service';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';
import { STATS_MIN_SAMPLE } from '@/common/constants/question';

const choices = () => [
  { id: 'c1', isCorrect: true },
  { id: 'c2', isCorrect: false },
  { id: 'c3', isCorrect: false },
];

async function makeService(question: unknown) {
  const prisma = {
    question: { findUnique: jest.fn().mockResolvedValue(question) },
  } as unknown as PrismaService;
  const module = await Test.createTestingModule({
    providers: [
      QuestionsService,
      { provide: PrismaService, useValue: prisma },
      // getStats는 LLM을 쓰지 않지만 생성자가 요구한다.
      { provide: GeminiLlmService, useValue: {} },
    ],
  }).compile();
  return module.get(QuestionsService);
}

describe('QuestionsService.getStats (B1)', () => {
  it('표본이 임계값 이상이면 정답률·평균시간을 계산한다', async () => {
    const service = await makeService({
      choices: choices(),
      totalSolvedCount: 20,
      correctSolvedCount: 15,
      totalTimeSpentSec: 600,
      timedSolvedCount: 20,
      choiceStats: [
        { choiceId: 'c1', count: 15 },
        { choiceId: 'c3', count: 5 },
      ],
    });

    const stats = await service.getStats('q1');

    expect(stats.correctRate).toBe(75); // 15/20
    expect(stats.avgTimeSpentSec).toBe(30); // 600/20
    expect(stats.totalSolved).toBe(20);
  });

  it('표본이 임계값 미만이면 비율을 숨긴다 (분포는 그대로 노출)', async () => {
    const service = await makeService({
      choices: choices(),
      totalSolvedCount: STATS_MIN_SAMPLE - 1,
      correctSolvedCount: 1,
      totalTimeSpentSec: 90,
      timedSolvedCount: STATS_MIN_SAMPLE - 1,
      choiceStats: [{ choiceId: 'c2', count: 8 }],
    });

    const stats = await service.getStats('q1');

    expect(stats.correctRate).toBeNull();
    expect(stats.avgTimeSpentSec).toBeNull();
    // 분포는 개별 응답 수라 임계값과 무관하게 노출한다.
    expect(stats.choiceDistribution[1]).toMatchObject({ index: 1, count: 8 });
  });

  it('정답률과 평균시간의 표본은 서로 독립이다', async () => {
    const service = await makeService({
      choices: choices(),
      totalSolvedCount: 20, // 채점 표본은 충분
      correctSolvedCount: 10,
      totalTimeSpentSec: 100,
      timedSolvedCount: 2, // 시간 표본은 부족
      choiceStats: [],
    });

    const stats = await service.getStats('q1');

    expect(stats.correctRate).toBe(50);
    expect(stats.avgTimeSpentSec).toBeNull();
    expect(stats.timedSampleCount).toBe(2);
  });

  it('선지 순서·정답 여부는 choices에서, 횟수는 통계 테이블에서 조인한다', async () => {
    const service = await makeService({
      choices: choices(),
      totalSolvedCount: 30,
      correctSolvedCount: 10,
      totalTimeSpentSec: 0,
      timedSolvedCount: 0,
      choiceStats: [{ choiceId: 'c3', count: 12 }],
    });

    const stats = await service.getStats('q1');

    expect(stats.choiceDistribution).toEqual([
      { index: 0, choiceId: 'c1', count: 0, isCorrect: true },
      { index: 1, choiceId: 'c2', count: 0, isCorrect: false },
      { index: 2, choiceId: 'c3', count: 12, isCorrect: false },
    ]);
  });

  it('통계 테이블에만 있고 choices에 없는 선지는 버린다 (리셋 이후 잔재 방어)', async () => {
    const service = await makeService({
      choices: [{ id: 'c1', isCorrect: true }],
      totalSolvedCount: 0,
      correctSolvedCount: 0,
      totalTimeSpentSec: 0,
      timedSolvedCount: 0,
      choiceStats: [{ choiceId: 'ghost', count: 99 }],
    });

    const stats = await service.getStats('q1');

    expect(stats.choiceDistribution).toHaveLength(1);
    expect(stats.choiceDistribution[0].count).toBe(0);
  });

  it('주관식(choices=null)이면 분포는 빈 배열', async () => {
    const service = await makeService({
      choices: null,
      totalSolvedCount: 20,
      correctSolvedCount: 20,
      totalTimeSpentSec: 200,
      timedSolvedCount: 20,
      choiceStats: [],
    });

    const stats = await service.getStats('q1');

    expect(stats.choiceDistribution).toEqual([]);
    expect(stats.correctRate).toBe(100);
  });

  it('없는 문항이면 404', async () => {
    const service = await makeService(null);
    await expect(service.getStats('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
