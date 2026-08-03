// =====================================================================
// 시험유형별 출제 형식 지시 — 조사 #36의 gap 1·2·5를 메우는 단일 출처.
//
//   gap 1: 선지 개수를 지정할 수단이 없어 4지/5지 관행을 보장 못 했다.
//   gap 2: 시스템 프롬프트가 "모든 텍스트는 한국어"를 강제해 영어 계열
//          (수능·내신·공무원 영어, 토익 RC)이 구조적으로 생성 불가였다.
//   gap 5: 프롬프트에 시험/대분류/소분류 라벨 3줄만 들어가 형식 지시가 전무했고,
//          그 결과 모든 시험이 수능 스타일로 치우쳤다(llm.types.ts 주석이 자인).
//
// DB 무관 순수 함수로 두어 프롬프트 조립(gemini-llm.service)과 테스트 양쪽에서 쓴다.
// 값의 근거는 docs/superpowers/research/2026-08-04-exam-type-expansion.md(#36).
// =====================================================================

/** 생성 출력 언어. 한국 시험의 영어 과목은 발문만 한국어인 혼합 형식이 관행이다. */
export const OUTPUT_LANGUAGES = ['ko', 'en', 'en-passage-ko-stem'] as const;
export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number];

/** 시험별 관행 — 선지 개수와 형식 지시. examType(subjects.exam_type) 값을 키로 쓴다. */
interface ExamFormat {
  /** 객관식 선지 개수 관행. 클라이언트가 choiceCount를 주면 그쪽이 우선한다. */
  choiceCount: number;
  /** 프롬프트에 그대로 실리는 형식 지시(시험별 관행). */
  hints: string[];
}

const EXAM_FORMATS: Readonly<Record<string, ExamFormat>> = {
  수능: {
    choiceCount: 5,
    hints: [
      '수능 관행: 객관식은 5지선다 단일정답. 발문은 "~은?", "~로 가장 적절한 것은?" 형태의 간결한 한 문장.',
      '국어·영어는 지문 세트형(지문 1개에 문항 여러 개)이 기본이고, 탐구는 표·그래프·실험 자료해석형과 ㄱㄴㄷ 합답형이 흔하다.',
      'ㄱㄴㄷ 합답형을 쓸 때는 보기를 발문 아래 <보기>로 제시하고 선지를 "ㄱ", "ㄴ", "ㄱ, ㄷ" 식으로 조합한다(정답은 여전히 1개).',
    ],
  },
  내신: {
    choiceCount: 5,
    hints: [
      '내신(고등학교 지필평가) 관행: 객관식은 수능 준거의 5지선다. 교육과정 성취기준과 교과서 지문 변형이 출제 근거다.',
      '서술형은 조건 제시형("~를 포함하여 두 문장으로 서술하시오")으로 만들고, 모범답안을 explanationText에 쓴다.',
    ],
  },
  '공무원 9급': {
    choiceCount: 4,
    hints: [
      '공무원 9급 관행: 객관식 4지선다 단일정답, 주관식 없음.',
      '2025년 출제 기조 전환 반영 — 단순 암기가 아니라 이해·추론·비판적 사고를 묻는다. 국어는 독해·논리 중심, 영어는 이메일·안내문 같은 실무 소재.',
      '한국사는 사료 제시형, 행정법은 판례·조문·사례적용형이 대표 형식이다.',
    ],
  },
  '공무원 7급': {
    choiceCount: 4,
    hints: [
      '공무원 7급 관행: 객관식 4지선다 단일정답, 9급보다 지문이 길고 추론 단계가 깊다.',
      '헌법·행정법은 판례·조문 적용형, 경제학은 계산·그래프 해석형이 대표 형식이다.',
    ],
  },
  공기업: {
    choiceCount: 4,
    hints: [
      'NCS 직업기초능력 관행: 객관식 4지선다 단일정답.',
      '모듈형은 표준 교재 개념을 묻는 단독 발문형, PSAT형은 표·그래프·문서 자료를 주고 해석·계산을 시키는 자료해석형이다.',
      '자료는 이미지 없이 텍스트 표로 표현한다(파이프 구분 등 평문으로).',
    ],
  },
  한능검: {
    choiceCount: 5,
    hints: [
      '한국사능력검정시험 관행: 객관식 5지선다 단일정답.',
      '사료·유물·인물 자료를 제시하고 시대·사건을 특정하게 하는 자료 제시형이 대표 형식이다.',
    ],
  },
  토익: {
    choiceCount: 4,
    hints: [
      'TOEIC RC 관행: 4지선다 단일정답, 지문·발문·선지 전부 영어.',
      'Part 5는 한 문장 빈칸(어법·어휘), Part 6은 지문 안에 빈칸이 놓인 형태, Part 7은 이메일·공지·기사 등 실무 문서 독해다.',
      '비즈니스 실무 상황(사내 공지, 주문·배송, 회의 일정 등)을 소재로 삼는다.',
    ],
  },
};

/** 언어 모드별 프롬프트 지시 — 시스템 프롬프트의 "모든 텍스트는 한국어"를 대체한다. */
// 해설(explanationText)과 keywords는 어느 모드에서도 한국어다 — 학습자가 한국인이고,
// keywords는 오답노트 개념별 통계의 집계 키라 언어가 섞이면 통계가 흩어진다.
const LANGUAGE_RULES: Readonly<Record<OutputLanguage, string>> = {
  ko: '- 모든 텍스트는 한국어.',
  en: '- 지문·발문·선지는 영어로 쓴다. 해설(explanationText)과 keywords는 한국어로 쓴다.',
  'en-passage-ko-stem':
    '- 지문·선지는 영어로, 발문(stemText)·해설(explanationText)·keywords는 한국어로 쓴다(한국 시험의 영어 과목 관행).',
};

/**
 * 시험/대분류로 출력 언어를 추정한다.
 *   토익 → 전부 영어
 *   (수능·내신·공무원 등의) 영어 대분류 → 지문·선지 영어 + 발문 한국어
 *   그 외 → 한국어
 * 클라이언트가 language를 명시하면 그 값이 우선한다(이 함수는 기본값 계산용).
 */
export function resolveOutputLanguage(examType?: string, examCategory?: string): OutputLanguage {
  if (examType === '토익') return 'en';
  if (examCategory === '영어') return 'en-passage-ko-stem';
  return 'ko';
}

/** 언어 모드에 해당하는 프롬프트 규칙 한 줄. */
export function languageRule(language: OutputLanguage): string {
  return LANGUAGE_RULES[language] ?? LANGUAGE_RULES.ko;
}

/** 시험별 관행 선지 개수. 모르는 시험이면 undefined(= LLM 자율, 기존 동작). */
export function defaultChoiceCount(examType?: string): number | undefined {
  return examType ? EXAM_FORMATS[examType]?.choiceCount : undefined;
}

/** 시험별 형식 지시 줄들. 모르는 시험이면 빈 배열(= 지시 없음, 기존 동작). */
export function examFormatHints(examType?: string): string[] {
  return (examType && EXAM_FORMATS[examType]?.hints) || [];
}
