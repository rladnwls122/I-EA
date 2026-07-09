/**
 * 실제 Gemini API 호출 검증. 기본 실행에서는 건너뛴다.
 *   RUN_LLM_TESTS=1 npx jest llm-verify --runInBand
 *
 * DB를 쓰지 않는다. GeminiLlmService.regenerateChoices만 실제로 때려서
 * "파서가 계약을 지키는가"가 아니라 "모델이 쓸 만한 선지를 주는가"를 본다.
 *
 * ⚠️ 네트워크와 토큰을 쓴다. 모델 출력은 비결정적이므로,
 *    내용이 아니라 **계약**(개수/단일정답/평문/KaTeX 부재)만 단언한다.
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { GeminiLlmService } from '@/modules/ai-generation/llm/gemini-llm.service';

const RUN = process.env.RUN_LLM_TESTS === '1';
const d = RUN ? describe : describe.skip;

d('실제 Gemini 호출 — regenerateChoices', () => {
  let llm: GeminiLlmService;

  beforeAll(() => {
    // ConfigService 대신 process.env를 그대로 읽는 얇은 어댑터.
    const config = { get: (k: string) => process.env[k] } as unknown as ConfigService;
    llm = new GeminiLlmService(config);
    expect(llm.isConfigured).toBe(true);
  });

  it('객관식 5지선다: 개수·단일정답 계약을 지킨다', async () => {
    const result = await llm.regenerateChoices({
      stemText: '이차방정식 x^2 - 5x + 6 = 0 의 두 근의 합은?',
      choiceCount: 5,
      difficulty: 2,
      examType: '수능',
      examCategory: '수학',
      subjectName: '대수',
    });

    expect(result.choices).toHaveLength(5);
    expect(result.choices.filter((c) => c.isCorrect)).toHaveLength(1);
    for (const c of result.choices) {
      expect(typeof c.content).toBe('string');
      expect(c.content.trim().length).toBeGreaterThan(0);
    }

    // 선지 본문이 서로 달라야 한다(중복 선지는 문항으로서 무의미).
    const bodies = result.choices.map((c) => c.content.trim());
    expect(new Set(bodies).size).toBe(5);

    console.log('\n[수학] 생성된 선지:');
    result.choices.forEach((c, i) =>
      console.log(`  ${i + 1}. ${c.isCorrect ? '✅' : '  '} ${c.content}`),
    );
  }, 30_000);

  it('KaTeX/LaTeX 문법이 섞이지 않는다 (수식은 평문)', async () => {
    const result = await llm.regenerateChoices({
      stemText: '함수 f(x) = x^3 - 3x 의 극댓값은?',
      choiceCount: 4,
      difficulty: 3,
      examType: '수능',
      examCategory: '수학',
      subjectName: '미적분',
    });

    expect(result.choices).toHaveLength(4);
    const all = result.choices.map((c) => c.content).join(' ');
    // 요구서: KaTeX 전면 제외. 프롬프트가 이를 강제하는지 확인.
    expect(all).not.toMatch(/\$\$?|\\frac|\\begin\{|\\left|\\right|\\cdot/);

    console.log('\n[미적분] 생성된 선지:');
    result.choices.forEach((c, i) =>
      console.log(`  ${i + 1}. ${c.isCorrect ? '✅' : '  '} ${c.content}`),
    );
  }, 30_000);

  it('국어(비수학) 발문도 처리한다', async () => {
    const result = await llm.regenerateChoices({
      stemText:
        '다음 시에서 화자의 정서를 가장 잘 드러내는 표현은? (지문: "산에는 꽃 피네 / 갈 봄 여름 없이 꽃이 피네")',
      choiceCount: 3,
      examType: '수능',
      examCategory: '국어',
      subjectName: '문학',
    });

    expect(result.choices).toHaveLength(3);
    expect(result.choices.filter((c) => c.isCorrect)).toHaveLength(1);

    console.log('\n[문학] 생성된 선지:');
    result.choices.forEach((c, i) =>
      console.log(`  ${i + 1}. ${c.isCorrect ? '✅' : '  '} ${c.content}`),
    );
  }, 30_000);

  // 무료 티어는 분당 요청 한도가 빡빡하다. 동시 호출은 429를 자초하므로 순차로 부른다.
  it('경계값: 최소 2지선다 / 최대 8지선다', async () => {
    const two = await llm.regenerateChoices({ stemText: '지구는 둥근가?', choiceCount: 2 });
    expect(two.choices).toHaveLength(2);
    expect(two.choices.filter((c) => c.isCorrect)).toHaveLength(1);

    const eight = await llm.regenerateChoices({
      stemText: '1부터 8까지의 자연수 중 소수가 아닌 것은?',
      choiceCount: 8,
    });
    expect(eight.choices).toHaveLength(8);
    expect(eight.choices.filter((c) => c.isCorrect)).toHaveLength(1);
  }, 60_000);
});
