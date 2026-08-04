/** BullMQ 큐 이름 — 서비스(생산자)와 프로세서(소비자)가 공유한다. */
export const AI_GENERATION_QUEUE = 'ai-generation';

/** 큐에 실리는 잡 이름 */
export const AI_GENERATION_JOB = 'generate';

/**
 * 오디오 기반(듣기) 소분류 패턴 — #36 gap 7 (결정 2026-08-04 결정 4).
 * 시드(prisma/seed.ts EXAM_MAP) 기준: 수능·내신 영어 소분류 '듣기', 토익 대분류 'LC'(Part1~4).
 * 오디오 파이프라인이 없으므로 해당 과목의 AI 생성 요청은 400으로 거부한다.
 * 스키마 플래그(subjects.isGeneratable)는 과목 관리 UI가 생기면 승격.
 */
export const AUDIO_SUBJECT_PATTERNS = ['듣기', 'LC'] as const;

/** 소분류가 오디오 기반(듣기)인지 판정. 'LC'는 대분류 정확 일치, '듣기'는 이름 포함으로 본다. */
export function isAudioSubject(subject: { name: string; examCategory: string }): boolean {
  return AUDIO_SUBJECT_PATTERNS.some((p) =>
    p === 'LC' ? subject.examCategory === 'LC' : subject.name.includes(p) || subject.examCategory.includes(p),
  );
}
