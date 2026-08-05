/**
 * 생성 품질 회귀 측정 — **판정 규칙**(네트워크 없음).
 *
 * #34가 "1차 마감선은 프롬프트 두 축 주입까지, LLM 자기검증은 도그푸딩에서 품질 미달이
 * 확인되면 후속"이라고 유예했다. 그런데 **"미달인지"를 볼 근거 데이터가 없었다** —
 * 템플릿을 13종까지 늘리는 동안 어느 템플릿이 계약을 얼마나 지키는지 아무도 세지 않았다.
 *
 * 여기 두는 것은 "LLM 출력이 우리가 요청한 형식을 지켰는가"를 판정하는 규칙뿐이다.
 * 실제 호출·집계는 `scripts/generation-quality.ts`가 한다(토큰을 쓰므로 CI 밖 수동 실행).
 * 규칙을 분리해 둔 이유는 판정 자체가 틀리면 측정값이 거짓말이 되기 때문이다 —
 * 이 파일은 네트워크 없이 테스트된다.
 *
 * **품질과 계약 준수는 다르다.** 여기서 세는 건 계약 준수뿐이다(선지 개수·정답 개수·지문 수·
 * 문항 수·출력 언어). "오답이 매력적인가" 같은 축은 코드로 판정할 수 없어 자기검증(#34 후속)의
 * 몫이다. 그 경계를 흐리지 마라 — 통과율 100%가 "좋은 문제"를 뜻하지 않는다.
 */
import type { OutputLanguage } from './exam-format';
import type { AnswerMode } from './format-templates';
import type { LlmGenerationResult } from './llm/llm.types';

/** 한 배치에 대해 우리가 요청한 형식. `resolveTemplateFormat` 결과에서 그대로 온다. */
export interface ExpectedFormat {
  questionCount: number;
  passageCount: number;
  choiceCount?: number;
  answerMode: AnswerMode;
  language?: OutputLanguage;
  questionType?: string;
}

/** 계약 위반 하나. `axis`는 집계 축이라 안정 키여야 한다. */
export interface ComplianceViolation {
  axis:
    | 'questionCount'
    | 'passageCount'
    | 'choiceCount'
    | 'answerMode'
    | 'language'
    | 'questionType'
    | 'emptyField';
  detail: string;
}

/**
 * 출력 언어 판정 휴리스틱.
 *
 * 정확한 언어 감지는 이 스크립트가 할 일이 아니다. 우리가 잡고 싶은 건 "영어로 쓰라고 했는데
 * 한국어로 왔다" 같은 **명백한** 위반이라, 한글 음절(가~힣)이 있는지만 본다.
 * 고유명사·인용은 섞일 수 있으므로 비율 기준을 둔다 — 한두 글자로 위반을 선언하면
 * 측정값이 노이즈로 가득 찬다.
 */
const HANGUL_RE = /[가-힣]/g;
const HANGUL_RATIO_LIMIT = 0.1;

export function hangulRatio(text: string): number {
  const total = text.replace(/\s/g, '').length;
  if (total === 0) return 0;
  return (text.match(HANGUL_RE)?.length ?? 0) / total;
}

/** 이 언어 설정에서 지문·선지가 영어여야 하는가. */
function expectsEnglishBody(language?: OutputLanguage): boolean {
  return language === 'en' || language === 'en-passage-ko-stem';
}

/**
 * 한 배치의 계약 준수 여부. 위반 목록이 비면 준수.
 * 파서를 이미 통과한 결과만 들어온다 — 파서가 잡는 것(구조·필수 필드)은 여기서 다시 보지 않는다.
 */
export function checkFormatCompliance(
  result: LlmGenerationResult,
  expected: ExpectedFormat,
): ComplianceViolation[] {
  const out: ComplianceViolation[] = [];

  if (result.questions.length !== expected.questionCount) {
    out.push({
      axis: 'questionCount',
      detail: `문항 ${result.questions.length}개 (요청 ${expected.questionCount}개)`,
    });
  }

  // 지문은 모드에 따라 담기는 자리가 다르다(단일=passage, 다중=passages[]).
  const gotPassages =
    expected.passageCount >= 2
      ? (result.passages?.length ?? 0)
      : result.passage?.bodyText.trim()
        ? 1
        : 0;
  if (gotPassages !== expected.passageCount) {
    out.push({
      axis: 'passageCount',
      detail: `지문 ${gotPassages}개 (요청 ${expected.passageCount}개)`,
    });
  }

  for (const [i, q] of result.questions.entries()) {
    const n = i + 1;

    if (!q.stemText.trim()) {
      out.push({ axis: 'emptyField', detail: `${n}번 발문이 비어 있음` });
    }

    if (expected.questionType && q.questionType !== expected.questionType) {
      out.push({
        axis: 'questionType',
        detail: `${n}번 유형 ${q.questionType} (요청 ${expected.questionType})`,
      });
    }

    if (q.questionType === '객관식') {
      const choices = q.choices ?? [];
      if (expected.choiceCount !== undefined && choices.length !== expected.choiceCount) {
        out.push({
          axis: 'choiceCount',
          detail: `${n}번 선지 ${choices.length}개 (요청 ${expected.choiceCount}개)`,
        });
      }
      const correct = choices.filter((c) => c.isCorrect).length;
      // 'multiple'은 "1개 이상"이 계약이다(#43 gap 4). 2개를 강제하지는 않는다 —
      // "모두 고른 것은?"의 정답이 하나뿐인 경우도 실제 시험에 있다.
      const ok = expected.answerMode === 'multiple' ? correct >= 1 : correct === 1;
      if (!ok) {
        out.push({
          axis: 'answerMode',
          detail: `${n}번 정답 ${correct}개 (${expected.answerMode} 모드)`,
        });
      }
    }
  }

  // 언어는 지문·선지 본문으로 본다. 'en-passage-ko-stem'은 발문이 한국어라 발문을 제외한다.
  if (expectsEnglishBody(expected.language)) {
    const body = [
      result.passage?.bodyText ?? '',
      ...(result.passages ?? []),
      ...result.questions.flatMap((q) => (q.choices ?? []).map((c) => c.content)),
    ].join(' ');
    const ratio = hangulRatio(body);
    if (ratio > HANGUL_RATIO_LIMIT) {
      out.push({
        axis: 'language',
        detail: `지문·선지에 한글 비율 ${(ratio * 100).toFixed(0)}% (${expected.language} 요청)`,
      });
    }
  }

  return out;
}

/* ── 골든 프롬프트 ──────────────────────────────────────────────────
 * 템플릿마다 "이 지시로 만들면 그 템플릿다운 문항이 나와야 한다"는 표준 요청.
 * 측정값이 회차 간에 비교 가능하려면 입력이 고정돼야 한다 — 매번 다른 주제로 재면
 * 통과율이 떨어졌을 때 모델이 나빠진 건지 주제가 어려웠던 건지 알 수 없다.
 * ──────────────────────────────────────────────────────────────── */

export const GOLDEN_PROMPTS: Readonly<Record<string, string>> = {
  'csat-korean-passage-set': '조선 후기 실학의 사회 개혁론을 다룬 인문 지문과 그 지문 기반 문항',
  'csat-integrated-passages': '(가) 공리주의와 (나) 의무론을 대비한 주제통합 지문과 통합 추론 문항',
  'csat-inquiry-data': '생태계 개체군 변동 자료를 해석하는 ㄱㄴㄷ 합답형 문항',
  'school-multi-answer': '이차함수 그래프의 성질 중 옳은 것을 모두 고르는 문항',
  'school-essay-condition': '광합성 명반응과 암반응의 차이를 조건에 맞춰 서술하는 문항',
  'civil-9-reading': '행정행위의 공정력을 설명한 지문과 그 추론 문항',
  'civil-9-source': '갑오개혁 관련 사료를 제시하고 시기를 판단하는 문항',
  'ncs-module': '문서이해능력 — 업무 지시문을 정확히 파악하는 모듈형 문항',
  'ncs-psat-data': '부서별 예산 집행률 표를 해석하는 자료해석 문항',
  'toeic-part5': 'business correspondence grammar — verb tense and preposition',
  'toeic-part7-single': 'a company memo announcing an office relocation',
  'toeic-part7-double': 'a job posting paired with an applicant email',
  'toeic-part7-triple': 'a conference schedule, a registration email, and an invoice',
};

/**
 * 골든 프롬프트가 없는 템플릿을 찾는다. 하네스는 이걸 보고 **실패한다** —
 * 템플릿을 늘리면서 측정 대상에 넣지 않으면, 통과율은 그대로인데 커버리지만 조용히 줄어든다.
 * (sanitize 화이트리스트를 에디터 확장과 락스텝으로 넓히게 만든 것과 같은 장치다.)
 */
export function templatesMissingGoldenPrompt(templateIds: readonly string[]): string[] {
  return templateIds.filter((id) => !GOLDEN_PROMPTS[id]);
}
