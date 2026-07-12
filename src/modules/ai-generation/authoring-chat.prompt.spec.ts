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
});
