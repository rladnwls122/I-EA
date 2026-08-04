// =====================================================================
// 시험별 출제 형식 템플릿 레지스트리 — #43 (결정 2026-08-04 결정 2).
//
// 템플릿은 시험 관행이라 변경 빈도가 낮고 프롬프트와 묶여 코드와 함께
// 테스트돼야 하므로 DB가 아니라 코드 레지스트리로 둔다(EXAM_FORMATS와 같은 판단).
// 운영자 런타임 편집 요구가 생기면 그때 DB로 승격한다.
//
// 값의 근거는 docs/superpowers/research/2026-08-04-exam-type-expansion.md §2.
// 다중지문 세트(gap 3)는 passageCount 2~3으로 표현한다 — 스키마는 원래 1:N
// (AiGeneration→Passage[], Question.passageId)이라 LLM 계약·프로세서만 확장했다.
// =====================================================================

import { QuestionKind } from '@/common/constants/question';
import { OutputLanguage } from './exam-format';

/** 정답 개수 모드. 'multiple'은 정답 2개 이상 허용(내신 "모두 고른 것은?" — gap 4). */
export type AnswerMode = 'single' | 'multiple';

/**
 * 템플릿 프롬프트 힌트. 의존성 메타가 붙은 힌트는 사용자의 오버라이드가 전제를
 * 뒤집으면(지문 제거·유형 변경) 해석 계층(resolveTemplateFormat)에서 떨궈진다 —
 * "윗글에 대한…" 같은 발문 패턴이 지문 없는 생성에 실리는 모순을 막는다.
 */
export interface TemplateHint {
  text: string;
  /** 지문이 있어야 의미 있는 힌트 — includePassage=false로 해석되면 싣지 않는다. */
  requiresPassage?: boolean;
  /** 특정 문제 유형을 전제하는 힌트 — 해석된 questionType이 다르면 싣지 않는다. */
  questionType?: QuestionKind;
}

export interface FormatTemplate {
  /** 안정 키 (input_params 스냅샷·프론트 선택값으로 쓰인다 — 바꾸면 재생성이 깨진다) */
  id: string;
  label: string;
  /** 이 템플릿을 노출/허용할 시험(subjects.examType) 목록 */
  examTypes: string[];
  description: string;
  structure: {
    /** 배치당 지문 수(0~3). 2 이상이면 다중지문 세트 — LLM 계약이 passages[] + passageIndex로 바뀐다. */
    passageCount: number;
    /** 지문 세트에 묶는 문항 수 권장 범위(프롬프트 힌트로만 쓴다 — questionCount는 요청값 우선). */
    questionsPerPassage?: [number, number];
    /**
     * 다중지문 세트에서 각 지문을 부르는 이름(#43). passageCount와 길이가 같아야 한다.
     * 시험마다 관행이 다르다 — 수능은 "(가)(나)", 토익은 "지문 1/2".
     * 생략하면 `지문 N`으로 매긴다.
     */
    passageLabels?: readonly string[];
    /** 객관식 선지 개수 기본값. 요청이 choiceCount를 명시하면 그쪽이 우선. */
    choiceCount?: number;
    answerMode: AnswerMode;
    /**
     * 출력 언어 기본값 — 언어가 형식의 본질인 템플릿(토익 등)만 지정한다.
     * 나머지는 비워 시험/대분류 추정(resolveOutputLanguage)이 동작하게 한다.
     * ⚠ 여기 'ko'를 깔면 공무원·내신 '영어' 과목에서 en-passage-ko-stem 추정이 막혀
     *   영어 지문 생성이 불가능해진다.
     */
    language?: OutputLanguage;
    /** 선호 문제 유형 기본값. 요청이 questionType을 명시하면 그쪽이 우선. */
    questionType?: QuestionKind;
  };
  /** 프롬프트에 실리는 형식 지시 — examFormatHints보다 구체적(발문 패턴·소재·선지 관행). */
  promptHints: TemplateHint[];
}

const FORMAT_TEMPLATES: readonly FormatTemplate[] = [
  {
    id: 'csat-korean-passage-set',
    label: '수능 국어 지문세트형',
    examTypes: ['수능'],
    description: '완결된 지문 1개에 3~6문항을 묶는 수능 국어 대표 형식. 5지선다 단일정답.',
    structure: {
      passageCount: 1,
      questionsPerPassage: [3, 6],
      choiceCount: 5,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      {
        text: '지문은 인문·사회·과학·기술·예술 소재의 완결된 비문학 글 또는 문학 작품 발췌로 쓴다.',
        requiresPassage: true,
      },
      {
        text: '발문 패턴: "윗글에 대한 이해로 가장 적절한 것은?", "윗글을 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?", "㉠에 대한 설명으로 적절한 것은?"',
        requiresPassage: true,
      },
      {
        text: '세트 안에서 사실적 이해 → 추론 → 비판·적용(＜보기＞ 결합) 순으로 문항 위계를 만든다.',
        requiresPassage: true,
      },
      {
        text: '모든 선지는 지문 근거로만 참/거짓이 판별되게 쓴다 — 배경지식만으로 풀리면 안 된다.',
        requiresPassage: true,
        questionType: '객관식',
      },
    ],
  },
  {
    id: 'csat-integrated-passages',
    label: '수능 국어 (가)(나) 주제통합형',
    examTypes: ['수능'],
    description:
      '같은 화제를 다른 관점에서 다루는 (가)(나) 두 지문을 묶어 읽는 수능 독서 주제통합형. 5지선다.',
    structure: {
      passageCount: 2,
      questionsPerPassage: [4, 6],
      passageLabels: ['(가)', '(나)'],
      choiceCount: 5,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      {
        text: '(가)와 (나)는 같은 화제를 서로 다른 관점·이론·시대로 다루는 두 글로 쓴다 — 한쪽이 다른 쪽을 보완하거나 반박하는 관계가 좋다.',
        requiresPassage: true,
      },
      {
        text: '발문 패턴: "(가)와 (나)에 대한 이해로 가장 적절한 것은?", "(가)의 관점에서 (나)를 평가한 내용으로 적절한 것은?", "(가), (나)를 바탕으로 <보기>를 이해한 내용으로 적절하지 않은 것은?"',
        requiresPassage: true,
      },
      {
        text: '세트 중 1~2문항은 두 지문을 통합·비교해야만 풀리는 문항으로 만들고, 나머지는 개별 지문의 사실적 이해·추론을 묻는다.',
        requiresPassage: true,
      },
    ],
  },
  {
    id: 'csat-inquiry-data',
    label: '수능 탐구 자료해석형',
    examTypes: ['수능'],
    description: '표·그래프·실험 자료를 해석시키는 수능 탐구 대표 형식. ㄱㄴㄷ 합답형 허용, 5지선다.',
    structure: {
      passageCount: 0,
      choiceCount: 5,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      { text: '표·그래프·실험 상황을 발문 아래에 텍스트로 제시한다(표는 파이프 구분 등 평문 표기).' },
      {
        text: '발문 패턴: "이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?", "다음 자료에 대한 분석으로 옳은 것은?"',
      },
      {
        text: 'ㄱㄴㄷ 합답형을 쓸 때는 <보기>에 ㄱ·ㄴ·ㄷ 진술을 제시하고 선지를 "ㄱ", "ㄴ", "ㄱ, ㄷ", "ㄴ, ㄷ", "ㄱ, ㄴ, ㄷ" 식 조합으로 만든다(정답 선지는 1개).',
        questionType: '객관식',
      },
      { text: '자료의 수치·조건을 실제로 대조해야만 정오가 갈리는 진술로 구성한다.' },
    ],
  },
  {
    id: 'school-multi-answer',
    label: '내신 복수정답형 (모두 고른 것은?)',
    examTypes: ['내신'],
    description: '정답이 2개 이상일 수 있는 내신 지필평가 형식. 5지선다, 복수정답.',
    structure: {
      passageCount: 0,
      choiceCount: 5,
      answerMode: 'multiple',
      questionType: '객관식',
    },
    promptHints: [
      {
        text: '발문은 "~에 대한 설명으로 옳은 것을 모두 고른 것은?" / "~를 모두 고르시오" 형태로 쓴다.',
        questionType: '객관식',
      },
      {
        text: '정답(isCorrect:true)은 2~3개로 만든다 — 1개만 정답이면 이 형식의 의미가 없다.',
        questionType: '객관식',
      },
      {
        text: '교육과정 성취기준과 교과서 서술을 출제 근거로 삼고, 오답도 교과서 문장을 미세하게 비튼 진술로 만든다.',
        questionType: '객관식',
      },
    ],
  },
  {
    id: 'school-essay-condition',
    label: '내신 서술형 조건제시형',
    examTypes: ['내신'],
    description: '조건을 제시하고 서술을 요구하는 내신 서답형. 주관식(자기채점), 모범답안은 해설에.',
    structure: {
      passageCount: 0,
      answerMode: 'single',
      questionType: '주관식',
    },
    promptHints: [
      {
        text: '발문은 조건 제시형으로 쓴다: "~라는 용어를 포함하여 두 문장으로 서술하시오", "~의 이유를 근거 두 가지와 함께 서술하시오".',
        questionType: '주관식',
      },
      {
        text: '서술형이므로 answerText는 쓰지 않는다 — 모범답안과 채점 포인트(꼭 들어가야 할 핵심어)를 explanationText에 서술한다.',
        questionType: '주관식',
      },
      {
        text: '조건(포함 단어·문장 수·형식)이 채점 가능할 만큼 구체적이어야 한다.',
        questionType: '주관식',
      },
    ],
  },
  {
    id: 'civil-9-reading',
    label: '공무원 9급 독해·추론형',
    examTypes: ['공무원 9급'],
    description: '2025 출제 기조 전환을 반영한 독해·논리 중심 형식. 짧은 지문 1개에 1~2문항, 4지선다.',
    structure: {
      passageCount: 1,
      questionsPerPassage: [1, 2],
      choiceCount: 4,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      { text: '단순 암기가 아니라 사실적 이해·추론·비판적 사고(강화·약화)를 묻는다 — 2025 출제 기조 전환.' },
      {
        text: '발문 패턴: "다음 글의 중심 내용으로 가장 적절한 것은?", "다음 글에서 추론할 수 있는 것은?", "밑줄 친 주장을 강화하는 것은?"',
        requiresPassage: true,
      },
      {
        text: '지문은 짧고 밀도 있게(한 단락 내외), 소재는 이메일·안내문·보도자료 같은 실무 문서도 적극 활용한다.',
        requiresPassage: true,
      },
    ],
  },
  {
    id: 'civil-9-source',
    label: '공무원 9급 사료·판례제시형',
    examTypes: ['공무원 9급'],
    description: '사료(한국사)·판례/조문(행정법)을 제시하고 적용을 묻는 형식. 4지선다.',
    structure: {
      passageCount: 0,
      choiceCount: 4,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      { text: '발문 아래에 사료·판례·조문·사례를 인용 상자(－ 보기 －) 형태의 텍스트로 제시한다.' },
      {
        text: '발문 패턴: "다음 자료에 해당하는 시기의 사실로 옳은 것은?"(한국사), "다음 사례에 대한 판례의 입장으로 옳지 않은 것은?"(행정법).',
      },
      { text: '자료를 읽고 시대·사건·법리를 특정해야만 풀리게 한다 — 자료 없이 아는 지식만으로 풀리면 안 된다.' },
    ],
  },
  {
    id: 'ncs-module',
    label: 'NCS 모듈형',
    examTypes: ['공기업'],
    description: 'NCS 표준 교재 개념을 묻는 단독 발문형. 4지선다.',
    structure: {
      passageCount: 0,
      choiceCount: 4,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      { text: 'NCS 직업기초능력 표준 교재의 개념·절차·원칙을 묻는 단독 발문형으로 만든다.' },
      {
        text: '발문 패턴: "다음 중 ~에 대한 설명으로 적절하지 않은 것은?", "다음 사례에서 ~가 활용한 능력으로 가장 적절한 것은?"',
      },
      { text: '직장 업무 상황(회의, 문서 작성, 고객 응대, 팀 갈등 등) 시나리오를 소재로 삼는다.' },
    ],
  },
  {
    id: 'ncs-psat-data',
    label: 'NCS 자료해석형 (PSAT형)',
    examTypes: ['공기업'],
    description: '표·그래프 자료를 해석·계산시키는 PSAT형. 4지선다, 자료는 텍스트 표로.',
    structure: {
      passageCount: 0,
      choiceCount: 4,
      answerMode: 'single',
      questionType: '객관식',
    },
    promptHints: [
      { text: '표·그래프 자료를 발문 아래에 텍스트 표(파이프 구분)로 제시한다 — 이미지는 쓸 수 없다.' },
      { text: '발문 패턴: "다음 자료에 대한 설명으로 옳지 않은 것은?", "다음 자료를 근거로 판단할 때 옳은 것은?"' },
      {
        text: '증감률·비중·순위 비교 등 실제 계산을 요구하는 진술을 선지에 섞는다. 계산 과정은 해설에 단계별로 쓴다.',
        questionType: '객관식',
      },
    ],
  },
  {
    id: 'toeic-part5',
    label: '토익 Part 5 어법형',
    examTypes: ['토익'],
    description: '한 문장 빈칸에 어법·어휘를 채우는 형식. 지문 없음, 4지선다, 전부 영어.',
    structure: {
      passageCount: 0,
      choiceCount: 4,
      answerMode: 'single',
      language: 'en',
      questionType: '객관식',
    },
    promptHints: [
      { text: '한 문장 안에 빈칸(-------)을 하나 두고, 어법(품사·시제·태·수일치·전치사·관계사) 또는 어휘를 묻는다.' },
      {
        text: '선지는 단어 또는 짧은 구 4개 — 같은 어근의 파생형(예: rely / reliable / reliably / reliance)이나 의미가 유사한 어휘로 구성한다.',
        questionType: '객관식',
      },
      { text: '문장 소재는 비즈니스 실무(사내 공지, 주문·배송, 회의·출장, 인사)로 한다.' },
    ],
  },
  {
    id: 'toeic-part7-single',
    label: '토익 Part 7 단일지문',
    examTypes: ['토익'],
    description: '실무 문서 1개를 읽고 2~4문항을 푸는 독해 세트. 4지선다, 전부 영어.',
    structure: {
      passageCount: 1,
      questionsPerPassage: [2, 4],
      choiceCount: 4,
      answerMode: 'single',
      language: 'en',
      questionType: '객관식',
    },
    promptHints: [
      {
        text: '지문은 이메일·공지·기사·광고·문자 대화 같은 실무 문서 형식으로 쓴다(발신·수신·날짜 등 머리말 포함).',
        requiresPassage: true,
      },
      {
        text: '발문 패턴: "What is the purpose of the e-mail?", "What is suggested about ~?", "The word ~ in paragraph 1 is closest in meaning to".',
        requiresPassage: true,
      },
      { text: '세트 안에서 주제·목적 / 세부사항 / 추론 / 동의어 유형을 섞는다.', requiresPassage: true },
    ],
  },
  {
    id: 'toeic-part7-double',
    label: '토익 Part 7 이중지문',
    examTypes: ['토익'],
    description: '서로 연계된 실무 문서 2개를 읽고 5문항을 푸는 독해 세트. 4지선다, 전부 영어.',
    structure: {
      passageCount: 2,
      questionsPerPassage: [5, 5],
      passageLabels: ['Passage 1', 'Passage 2'],
      choiceCount: 4,
      answerMode: 'single',
      language: 'en',
      questionType: '객관식',
    },
    promptHints: [
      {
        text: '두 문서는 같은 상황으로 연계된 실무 문서 쌍으로 쓴다(예: 행사 공지 + 문의 이메일, 광고 + 주문서, 이메일 + 답장).',
        requiresPassage: true,
      },
      {
        text: '세트 문항 중 1~2개는 두 문서의 정보를 통합해야만 풀리는 연계 추론 문항으로 만들고, 나머지는 개별 문서의 세부사항·목적을 묻는다.',
        requiresPassage: true,
      },
      {
        text: '발문 패턴: "What is indicated about ~?", "What is suggested about the order?", "Why did Ms. ~ send the e-mail?"',
        requiresPassage: true,
      },
    ],
  },
  {
    id: 'toeic-part7-triple',
    label: '토익 Part 7 삼중지문',
    examTypes: ['토익'],
    description: '서로 연계된 실무 문서 3개를 읽고 5문항을 푸는 독해 세트. 4지선다, 전부 영어.',
    structure: {
      passageCount: 3,
      questionsPerPassage: [5, 5],
      passageLabels: ['Passage 1', 'Passage 2', 'Passage 3'],
      choiceCount: 4,
      answerMode: 'single',
      language: 'en',
      questionType: '객관식',
    },
    promptHints: [
      {
        text: '세 문서는 하나의 상황으로 연계된 실무 문서 묶음으로 쓴다(예: 웹페이지 안내 + 예약 확인 이메일 + 후기, 공고 + 지원서 + 답신).',
        requiresPassage: true,
      },
      {
        text: '세트 문항 중 1~2개는 두 개 이상의 문서를 통합해야만 풀리는 연계 추론 문항으로 만들고, 나머지는 개별 문서의 세부사항·목적을 묻는다.',
        requiresPassage: true,
      },
      {
        text: '발문 패턴: "What is most likely true about ~?", "According to the review, what ~?", "What is the purpose of the notice?"',
        requiresPassage: true,
      },
    ],
  },
];

/** DTO @IsIn 검증용 안정 키 목록. */
export const FORMAT_TEMPLATE_IDS: readonly string[] = FORMAT_TEMPLATES.map((t) => t.id);

/** id로 템플릿 조회. 모르는 id면 undefined. */
export function getTemplate(id: string): FormatTemplate | undefined {
  return FORMAT_TEMPLATES.find((t) => t.id === id);
}

/** 템플릿 목록. examType을 주면 그 시험에 노출되는 것만 필터한다. */
export function listTemplates(examType?: string): FormatTemplate[] {
  const all = [...FORMAT_TEMPLATES];
  return examType ? all.filter((t) => t.examTypes.includes(examType)) : all;
}

/** 요청에서 사용자가 명시한 개별 파라미터(명시 안 하면 undefined). */
export interface ExplicitGenerationParams {
  choiceCount?: number;
  language?: OutputLanguage;
  includePassage?: boolean;
  questionType?: QuestionKind;
}

/** 템플릿 기본값 + 명시 파라미터를 합친 최종 해석 결과. */
export interface ResolvedGenerationFormat {
  choiceCount?: number;
  language?: OutputLanguage;
  includePassage: boolean;
  /**
   * 최종 지문 수(0~3). includePassage=false면 0, 템플릿 없이 includePassage=true면 1(종전 동작),
   * 다중지문 템플릿이면 2~3 — LLM 계약이 passages[] + passageIndex로 바뀐다(gap 3).
   */
  passageCount: number;
  /**
   * 다중지문 세트에서 각 지문의 표시 이름(#43). passageCount가 2 미만이면 빈 배열.
   * 세트로 저장할 때 Passage.label로 들어가 풀이 화면이 "(가)/(나)"로 구분해 보여준다.
   */
  passageLabels: string[];
  questionType?: QuestionKind;
  answerMode: AnswerMode;
  promptHints: string[];
}

/**
 * 템플릿 해석 계층 — 템플릿이 기본값을 깔고, 사용자가 명시한 개별 파라미터가 항상 우선한다.
 * 템플릿이 없으면 종전 동작 그대로(기본값 없음, includePassage=false, 단일정답).
 * 오버라이드가 템플릿 전제를 뒤집으면(지문 제거·유형 변경) 모순되는 힌트를 떨군다.
 */
export function resolveTemplateFormat(
  template: FormatTemplate | undefined,
  explicit: ExplicitGenerationParams,
): ResolvedGenerationFormat {
  const s = template?.structure;
  const includePassage = explicit.includePassage ?? (s ? s.passageCount >= 1 : false);
  // 지문을 켰다면 지문 수는 템플릿을 따른다(템플릿 없이 켜면 1 — 종전 동작).
  // 지문 0짜리 템플릿에 includePassage=true를 명시하면 단일 지문으로 해석한다.
  const passageCount = includePassage ? Math.max(1, s?.passageCount ?? 1) : 0;
  const questionType = explicit.questionType ?? s?.questionType;
  const promptHints = (template?.promptHints ?? [])
    .filter((h) => !(h.requiresPassage && !includePassage))
    .filter((h) => !(h.questionType && questionType && h.questionType !== questionType))
    .map((h) => h.text);
  // 지문 세트 권장 문항 수는 질문 수를 강제하지 않고 힌트로만 흘린다(questionCount는 요청값).
  if (s?.questionsPerPassage && includePassage) {
    const [lo, hi] = s.questionsPerPassage;
    const range = lo === hi ? `${lo}개` : `${lo}~${hi}개`;
    promptHints.push(
      passageCount >= 2
        ? `지문 ${passageCount}개 세트 전체에 문항 ${range}를 묶는 구성이 관행이다.`
        : `지문 하나에 문항 ${range}를 묶는 세트 구성이 관행이다.`,
    );
  }
  return {
    choiceCount: explicit.choiceCount ?? s?.choiceCount,
    // 언어 우선순위: 사용자 명시 > 템플릿(언어가 본질인 것만 지정) > 시험/대분류 추정(호출부).
    language: explicit.language ?? s?.language,
    includePassage,
    passageCount,
    // 세트가 아닐 때(0~1개)는 라벨이 의미 없다 — 빈 배열로 두어 호출부가 분기하지 않게 한다.
    // 템플릿이 라벨을 안 줬거나 개수가 어긋나면 `지문 N`으로 채운다.
    passageLabels:
      passageCount >= 2
        ? Array.from(
            { length: passageCount },
            (_, i) => s?.passageLabels?.[i] ?? `지문 ${i + 1}`,
          )
        : [],
    questionType,
    answerMode: s?.answerMode ?? 'single',
    promptHints,
  };
}
