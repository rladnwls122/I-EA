/**
 * 캔버스 저장의 **오케스트레이션** (#41 Phase 3).
 *
 * Phase 3 첫 조각(`authoring-save.ts`)은 "무엇을 저장할지 정하는 규칙"만 순수 모듈로 뺐고,
 * **호출 순서와 실패 처리는 컴포넌트에 그대로 남겼다** — 그건 별개 문제라고 적어 뒀었다.
 * 여기가 그 별개 문제다.
 *
 * 순서와 실패 처리는 규칙보다 오히려 테스트가 필요했다. 실제로 여기 숨어 있던 것들:
 *   - 기존 문제집을 열어 저장하면 **지문이 매번 새로 만들어져 복제**됐다(항상 createPassage).
 *   - 오탈자 하나를 고쳐도 **전 문항에 PATCH**가 나갔다(변경 감지 없음).
 *   - 업로드한 이미지가 `media_assets`에 **끝내 등록되지 않았다**(저장 전엔 부를 수 없어 미룬 것).
 * 이것들은 "실제로 저장해 보는" 방법 말고는 확인할 길이 없었다.
 *
 * 그래서 네트워크를 **주입받는다**(`SaveClient`). 이 모듈은 fetch도 toast도 모른다 —
 * 사용자에게 무엇을 알릴지는 `notices`로 돌려주고, 화면 상태를 어떻게 바꿀지는
 * `newQuestionIdByCardId` 같은 결과값으로 돌려준다. 컴포넌트는 그걸 옮기기만 한다.
 */
import type { CanvasCard } from './AuthoringCanvas';
import {
  buildQuestionPayload,
  cardImageSrcs,
  collectImageSrcs,
  isPersistedCard,
  isPersistedPassageGroup,
  isSavableCard,
  normalizeKeywords,
  passageFingerprint,
  passageGroupOf,
  questionFingerprint,
  uniquePassages,
} from './authoring-save';

/* ── 주입 경계 ────────────────────────────────────────────────────── */

/**
 * 저장이 쓰는 서버 호출의 전부. 이름은 API 경로가 아니라 **의도**로 짓는다 —
 * 이 모듈은 어떤 엔드포인트가 있는지 알 필요가 없다.
 */
export interface SaveClient {
  createPassage(content: unknown): Promise<{ id: string }>;
  publishPassage(id: string): Promise<unknown>;
  updatePassage(id: string, content: unknown): Promise<unknown>;
  /** #키워드 카테고리의 기존 태그 전체. */
  listKeywordTags(): Promise<{ id: string; name: string }[]>;
  createKeywordTag(name: string): Promise<{ id: string }>;
  createQuestion(payload: unknown): Promise<{ id: string }>;
  updateQuestion(id: string, payload: unknown): Promise<unknown>;
  publishQuestion(id: string): Promise<unknown>;
  addQuestionToWorkbook(questionId: string): Promise<unknown>;
  updateWorkbook(patch: {
    tagIds: string[];
    visibility?: 'PUBLIC' | 'PRIVATE';
  }): Promise<unknown>;
  registerImage(args: {
    storageUrl: string;
    questionId?: string;
    passageId?: string;
  }): Promise<unknown>;
}

/* ── 서버와 일치하던 마지막 모습 ──────────────────────────────────── */

/**
 * 무엇을 건너뛸 수 있는지 판단하는 근거. 불러올 때 채우고, 저장에 **성공한 것만** 갱신한다.
 * 실패한 항목의 기준선을 갱신하면 다음 저장이 "안 바뀌었다"며 건너뛰어 서버와 영영 어긋난다.
 */
export interface SaveBaseline {
  /** 카드 id → 마지막으로 서버와 일치했던 문항 페이로드 지문. */
  questions: Record<string, string>;
  /** 지문 그룹 id → 마지막으로 서버와 일치했던 지문 내용. */
  passages: Record<string, string>;
  /** 이미 등록됐다고 보는 이미지 URL — 다시 등록하면 media_assets에 중복 행만 쌓인다. */
  registeredImages: string[];
}

export function emptyBaseline(): SaveBaseline {
  return { questions: {}, passages: {}, registeredImages: [] };
}

/* ── 입출력 ──────────────────────────────────────────────────────── */

export interface SaveInput {
  cards: CanvasCard[];
  subjectId: string;
  workbookKeywords: string[];
  isPublic: boolean;
  /** 문제집 공개 설정이 서버와 달라졌는지 — 안 바뀌었으면 visibility를 보내지 않는다. */
  visibilityChanged: boolean;
  baseline: SaveBaseline;
}

/** 사용자에게 보여줄 알림. 이 모듈은 toast를 모른다. */
export interface SaveNotice {
  level: 'success' | 'error';
  message: string;
}

export interface SaveOutcome {
  /** local 카드 id → 새로 만들어진 실제 question id. 카드 id 교체용(재저장 중복 생성 방지). */
  newQuestionIdByCardId: Record<string, string>;
  /** local 지문 그룹 id → 새로 만들어진 실제 passage id. */
  newPassageIdByGroupId: Record<string, string>;
  /** 이번 저장 후의 기준선. 성공한 항목만 반영돼 있다. */
  baseline: SaveBaseline;
  notices: SaveNotice[];
  /** 실제로 서버에 쓴 문항 수 / 변경이 없어 건너뛴 수 / 실패 수. */
  savedCount: number;
  skippedCount: number;
  failedCount: number;
}

/* ── 동시성 ──────────────────────────────────────────────────────── */

/**
 * 갱신 경로에만 쓰는 제한 병렬. 상한을 두는 이유는 서버 레이트 리밋이고,
 * **생성 경로에는 쓰지 않는다** — 새 문항은 담기는 순서가 곧 문제집 순서라
 * 병렬로 돌리면 순서가 뒤섞인다.
 */
const UPDATE_CONCURRENCY = 4;

async function mapWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ── 본체 ────────────────────────────────────────────────────────── */

export async function runSave(input: SaveInput, client: SaveClient): Promise<SaveOutcome> {
  const notices: SaveNotice[] = [];
  const newQuestionIdByCardId: Record<string, string> = {};
  const newPassageIdByGroupId: Record<string, string> = {};
  const baseline: SaveBaseline = {
    questions: { ...input.baseline.questions },
    passages: { ...input.baseline.passages },
    registeredImages: [...input.baseline.registeredImages],
  };
  const registered = new Set(baseline.registeredImages);

  /* 1) 지문 — 그룹당 한 번. 새 그룹만 만들고, 이미 있는 그룹은 내용이 바뀐 것만 고친다. */
  const passageIdByGroup = new Map<string, string>();
  for (const { groupId, passage } of uniquePassages(input.cards)) {
    const fingerprint = passageFingerprint(passage);
    if (isPersistedPassageGroup(groupId)) {
      passageIdByGroup.set(groupId, groupId);
      if (baseline.passages[groupId] === fingerprint) continue; // 안 바뀜
      try {
        await client.updatePassage(groupId, passage);
        baseline.passages[groupId] = fingerprint;
      } catch (e) {
        // 지문 갱신 실패는 문항을 못 잇는 실패가 아니다 — 연결은 그대로 살아 있고
        // 내용만 예전 것이다. 기준선을 갱신하지 않아 다음 저장에서 다시 시도한다.
        notices.push({ level: 'error', message: `지문 수정에 실패했어요 — ${errorText(e)}` });
      }
      continue;
    }
    try {
      const created = await client.createPassage(passage);
      await client.publishPassage(created.id).catch(() => null); // 발행 실패는 담기에 치명적이지 않다
      passageIdByGroup.set(groupId, created.id);
      newPassageIdByGroupId[groupId] = created.id;
      baseline.passages[created.id] = fingerprint;
      await registerImages(collectImageSrcs(passage), { passageId: created.id });
    } catch (e) {
      notices.push({
        level: 'error',
        message: `지문 저장에 실패했어요 — 해당 문항은 지문 없이 저장됩니다. (${errorText(e)})`,
      });
    }
  }

  /* 2) #키워드 → 태그 find-or-create. 목록은 한 번만 받아 이름으로 재사용한다. */
  const tagIdByName = new Map<string, string>();
  try {
    for (const t of await client.listKeywordTags()) {
      tagIdByName.set(t.name.trim().toLowerCase(), t.id);
    }
  } catch {
    // 목록을 못 받아도 저장을 막지 않는다 — 아래에서 전부 새로 만들려 시도한다.
  }
  const resolveTagIds = async (keywords: string[]): Promise<string[]> => {
    const ids: string[] = [];
    for (const name of normalizeKeywords(keywords)) {
      const key = name.toLowerCase();
      let id = tagIdByName.get(key);
      if (!id) {
        try {
          id = (await client.createKeywordTag(name)).id;
          tagIdByName.set(key, id);
        } catch {
          continue; // 이 키워드만 건너뛰고 나머지는 계속
        }
      }
      ids.push(id);
    }
    return ids;
  };

  /* 3) 문항 — 새 문항은 순서대로 하나씩(담기는 순서가 문제집 순서), 갱신은 제한 병렬. */
  let savedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let lastError = '';

  const payloadFor = async (card: CanvasCard) => {
    const group = passageGroupOf(card);
    const tagIds = await resolveTagIds(card.keywords);
    return buildQuestionPayload(card, {
      tagIds,
      passageId: group ? passageIdByGroup.get(group) : undefined,
    });
  };

  const savable = input.cards.filter(isSavableCard);
  const toUpdate: CanvasCard[] = [];
  const toCreate: CanvasCard[] = [];
  for (const card of savable) {
    if (!isPersistedCard(card.id)) {
      toCreate.push(card);
      continue;
    }
    // 지문이 이번에 새로 생겼으면 문항의 passageId도 바뀌므로 반드시 다시 써야 한다.
    const group = passageGroupOf(card);
    const passageJustCreated = !!group && group in newPassageIdByGroupId;
    if (!passageJustCreated && baseline.questions[card.id] === questionFingerprint(card)) {
      skippedCount += 1;
      continue;
    }
    toUpdate.push(card);
  }

  await mapWithLimit(toUpdate, UPDATE_CONCURRENCY, async (card) => {
    try {
      const payload = await payloadFor(card);
      await client.updateQuestion(card.id, payload);
      savedCount += 1;
      baseline.questions[card.id] = questionFingerprint(card);
      await registerImages(cardImageSrcs(card), { questionId: card.id });
    } catch (e) {
      failedCount += 1;
      lastError = errorText(e);
    }
  });

  for (const card of toCreate) {
    try {
      const payload = await payloadFor(card);
      const created = await client.createQuestion({ subjectId: input.subjectId, ...payload });
      // 발행 실패를 삼키고 담기를 강행하면 백엔드가 "발행되지 않은 문항" 404를 돌려줘
      // 원인이 가려진다 — 단계별로 실패를 구분한다.
      await client.publishQuestion(created.id);
      await client.addQuestionToWorkbook(created.id);
      savedCount += 1;
      newQuestionIdByCardId[card.id] = created.id;
      // 기준선은 **새 id** 기준으로 남긴다 — 컴포넌트가 카드 id를 교체하므로
      // 다음 저장에서는 이 카드가 새 id로 찾아온다.
      baseline.questions[created.id] = questionFingerprint({ ...card, id: created.id });
      await registerImages(cardImageSrcs(card), { questionId: created.id });
    } catch (e) {
      failedCount += 1;
      lastError = errorText(e);
    }
  }

  if (failedCount > 0) {
    notices.push({
      level: 'error',
      message: `${failedCount}개 문항 저장에 실패했어요.${lastError ? ` (${lastError})` : ''}`,
    });
  } else if (savedCount > 0) {
    notices.push({ level: 'success', message: `${savedCount}개 문항을 문제집에 저장했어요.` });
  } else if (skippedCount > 0) {
    // "0개 저장했어요"는 실패처럼 읽힌다. 바뀐 게 없었다는 사실을 그대로 말한다.
    notices.push({ level: 'success', message: '바뀐 내용이 없어 그대로 두었어요.' });
  }

  /* 4) 문제집 메타 — 공개 설정(바뀐 경우만) + #키워드(항상 전체 교체). */
  try {
    const workbookTagIds = await resolveTagIds(input.workbookKeywords);
    const visibility = input.isPublic ? 'PUBLIC' : 'PRIVATE';
    await client.updateWorkbook({
      tagIds: workbookTagIds,
      ...(input.visibilityChanged ? { visibility } : {}),
    });
    if (input.visibilityChanged) {
      notices.push({
        level: 'success',
        message: input.isPublic ? '문제집을 공개로 전환했어요.' : '문제집을 비공개로 되돌렸어요.',
      });
    }
  } catch (e) {
    notices.push({ level: 'error', message: `문제집 설정 변경에 실패했어요. (${errorText(e)})` });
  }

  baseline.registeredImages = [...registered];
  return {
    newQuestionIdByCardId,
    newPassageIdByGroupId,
    baseline,
    notices,
    savedCount,
    skippedCount,
    failedCount,
  };

  /**
   * 이번에 새로 들어온 이미지만 등록한다. 실패해도 저장을 실패로 만들지 않는다 —
   * 등록은 자원 목록(media_assets)을 채우는 부수 작업이고, 이미지 자체는 문서의
   * src로 이미 살아 있어 화면에는 정상적으로 보인다.
   */
  async function registerImages(
    srcs: string[],
    target: { questionId?: string; passageId?: string },
  ): Promise<void> {
    for (const storageUrl of srcs) {
      if (registered.has(storageUrl)) continue;
      try {
        await client.registerImage({ storageUrl, ...target });
        registered.add(storageUrl);
      } catch {
        // 조용히 넘긴다. 다음 저장에서 다시 시도된다.
      }
    }
  }
}
