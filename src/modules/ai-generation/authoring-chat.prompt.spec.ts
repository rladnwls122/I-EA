import { buildAuthoringSystemPrompt, QUESTION_BLOCK_LANG } from './authoring-chat.prompt';

describe('buildAuthoringSystemPrompt', () => {
  it('과목·배치수·펜스 블록 규약을 프롬프트에 포함한다', () => {
    const p = buildAuthoringSystemPrompt({
      subjectName: '문학',
      examCategory: '국어',
      batchSize: 3,
    });
    expect(p).toContain('문학');
    expect(p).toContain('국어');
    expect(p).toContain('3');
    expect(p).toContain(QUESTION_BLOCK_LANG);
    expect(p).toContain('평문');
  });

  it('현재 문항이 있으면 교체 참조용으로 목록을 넣는다', () => {
    const p = buildAuthoringSystemPrompt({
      batchSize: 1,
      currentQuestions: [
        { index: 1, questionType: '객관식', stem: '지구는?' },
      ],
    });
    expect(p).toContain('지구는?');
    expect(p).toContain('replace:1');
  });

  it('현재 문항의 선지·정답·해설도 요약해 넣는다 — 교체 요청 시 AI가 기존 내용을 본다', () => {
    const p = buildAuthoringSystemPrompt({
      batchSize: 1,
      currentQuestions: [
        {
          index: 2,
          questionType: '객관식',
          stem: '태양계에서 가장 큰 행성은?',
          choices: ['수성', '목성', '화성'],
          answer: '목성',
          explanation: '목성은 태양계 최대 행성이다.',
        },
      ],
    });
    expect(p).toContain('1) 수성');
    expect(p).toContain('2) 목성');
    expect(p).toContain('정답: 목성');
    expect(p).toContain('해설: 목성은 태양계 최대 행성이다.');
  });

  describe('선지 개수·지문 포함 힌트 (편집기 일원화로 캔버스에 옮긴 조작)', () => {
    it('선지 개수를 지정하면 정확한 개수를 지시한다', () => {
      expect(buildAuthoringSystemPrompt({ batchSize: 1, choiceCount: 5 })).toContain(
        '정확히 5개',
      );
    });

    it('OX일 때는 선지 개수 지시를 넣지 않는다 — 2지 규약과 충돌해 모델이 흔들린다', () => {
      const p = buildAuthoringSystemPrompt({
        batchSize: 1,
        questionType: '객관식',
        ox: true,
        choiceCount: 5,
      });
      expect(p).not.toContain('정확히 5개');
      expect(p).toContain('O(맞다)');
    });

    it('지문 포함을 켜면 지문 없이 못 푸는 문항을 요구한다', () => {
      expect(buildAuthoringSystemPrompt({ batchSize: 1, includePassage: true })).toContain(
        '지문 없이는 풀 수 없는',
      );
    });

    it('지문 포함을 끄면 지문을 넣지 말라고 지시한다', () => {
      expect(buildAuthoringSystemPrompt({ batchSize: 1, includePassage: false })).toContain(
        'passage(지문)는 넣지 마세요',
      );
    });

    it('지정하지 않으면 어느 쪽 지시도 넣지 않는다 — 모델이 과목을 보고 판단한다', () => {
      const p = buildAuthoringSystemPrompt({ batchSize: 1 });
      expect(p).not.toMatch(/객관식 선지는 정확히/);
      expect(p).not.toContain('passage(지문)는 넣지 마세요');
      expect(p).not.toContain('지문 없이는 풀 수 없는');
    });
  });

  it('선지·정답·해설은 문항당 길이를 잘라 토큰 비대를 막는다', () => {
    const long = '가'.repeat(500);
    const p = buildAuthoringSystemPrompt({
      batchSize: 1,
      currentQuestions: [
        {
          index: 1,
          questionType: '주관식',
          stem: long,
          answer: long,
          explanation: long,
        },
      ],
    });
    // 가장 넉넉한 잘림 폭(해설 160)까지만 실리고, 500자 원문이 통째로 실리면 안 된다.
    expect(p).toContain('가'.repeat(160));
    expect(p).not.toContain('가'.repeat(161));
  });
});
