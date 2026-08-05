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
  removeQuestionFromWorkbook(questionId: string): Promise<unknown>;
  /** 문제집 **전체** 문항 순서. 서버가 빠짐없는 집합을 요구한다. */
  reorderWorkbookQuestions(questionIds: string[]): Promise<unknown>;
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
  /**
   * 지금 카드 목록이 문제집의 전부인가. 아니면 순서·빼기를 손대지 않는다 —
   * 반쪽 목록으로 순서를 보내면 서버가 "누락" 400을 주고, 빼기는 의도치 않은 삭제가 된다.
   */
  compositionKnown: boolean;
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

  // 발문이 빈 카드는 저장 대상이 아니다. 지문 루프까지 전체 카드를 돌면 어느 문항에도
  // 연결되지 않는 passage 행이 생성·발행된다.
  const savable = input.cards.filter(isSavableCard);

  /* 1) 지문 — 그룹당 한 번. 새 그룹만 만들고, 이미 있는 그룹은 내용이 바뀐 것만 고친다. */
  const passageIdByGroup = new Map<string, string>();
  for (const { groupId, passage } of uniquePassages(savable)) {
    const fingerprint = passageFingerprint(passage);
    if (isPersistedPassageGroup(groupId)) {
      passageIdByGroup.set(groupId, groupId);
      if (baseline.passages[groupId] === fingerprint) continue; // 안 바뀜
      try {
        await client.updatePassage(groupId, passage);
        baseline.passages[groupId] = fingerprint;
        // 생성 분기에만 등록이 있으면, 기존 지문에 새로 넣은 이미지는 끝내 등록되지 않는다.
        await registerImages(collectImageSrcs(passage), { passageId: groupId });
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
  /**
   * 키워드 → 태그 id. **실패를 숨기지 않는다** — 일부 태그를 못 만든 채 성공으로 치면
   * 그 카드의 기준선이 "키워드 전부 반영됨"으로 박혀, 빠진 키워드가 다음 저장에서도
   * 건너뛰어져 영영 사라진다.
   */
  const resolveTagIds = async (
    keywords: string[],
  ): Promise<{ ids: string[]; complete: boolean }> => {
    const ids: string[] = [];
    let complete = true;
    for (const name of normalizeKeywords(keywords)) {
      const key = name.toLowerCase();
      let id = tagIdByName.get(key);
      if (!id) {
        try {
          id = (await client.createKeywordTag(name)).id;
          tagIdByName.set(key, id);
        } catch {
          complete = false; // 이 키워드만 건너뛰고 나머지는 계속
          continue;
        }
      }
      ids.push(id);
    }
    return { ids, complete };
  };

  /* 3) 문항 — 새 문항은 순서대로 하나씩(담기는 순서가 문제집 순서), 갱신은 제한 병렬. */
  let savedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let lastError = '';

  /**
   * 기준선에 박을 카드 모습. 새로 만들어진 지문은 이 시점에 이미 실제 id를 얻었으므로
   * 그 id로 계산해야 한다 — local-passage-* 로 남겨 두면 리듀서가 곧바로 실제 id로
   * 갈아 끼우는 바람에 지문 가진 새 문항이 매번 한 번씩 헛 PATCH를 맞는다.
   */
  const withResolvedPassage = (card: CanvasCard): CanvasCard => {
    const group = passageGroupOf(card);
    const real = group ? passageIdByGroup.get(group) : undefined;
    return real && real !== group ? { ...card, passageGroupId: real } : card;
  };

  const payloadFor = async (card: CanvasCard) => {
    const group = passageGroupOf(card);
    const { ids, complete } = await resolveTagIds(card.keywords);
    return {
      payload: buildQuestionPayload(card, {
        tagIds: ids,
        // 지문을 뗀 카드는 null을 **명시**해야 서버가 기존 연결을 끊는다.
        passageId: group ? (passageIdByGroup.get(group) ?? null) : null,
      }),
      complete,
    };
  };

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
    if (
      !passageJustCreated &&
      baseline.questions[card.id] === questionFingerprint(withResolvedPassage(card))
    ) {
      skippedCount += 1;
      continue;
    }
    toUpdate.push(card);
  }

  await mapWithLimit(toUpdate, UPDATE_CONCURRENCY, async (card) => {
    try {
      const { payload, complete } = await payloadFor(card);
      await client.updateQuestion(card.id, payload);
      savedCount += 1;
      // 태그를 다 못 붙였으면 기준선을 세우지 않는다 — 다음 저장이 다시 시도해야 한다.
      if (complete) baseline.questions[card.id] = questionFingerprint(withResolvedPassage(card));
      await registerImages(cardImageSrcs(card), { questionId: card.id });
    } catch (e) {
      failedCount += 1;
      lastError = errorText(e);
    }
  });

  for (const card of toCreate) {
    try {
      const { payload, complete } = await payloadFor(card);
      const created = await client.createQuestion({ subjectId: input.subjectId, ...payload });
      // 발행 실패를 삼키고 담기를 강행하면 백엔드가 "발행되지 않은 문항" 404를 돌려줘
      // 원인이 가려진다 — 단계별로 실패를 구분한다.
      await client.publishQuestion(created.id);
      await client.addQuestionToWorkbook(created.id);
      savedCount += 1;
      newQuestionIdByCardId[card.id] = created.id;
      // 기준선은 **새 id** 기준으로 남긴다 — 컴포넌트가 카드 id를 교체하므로
      // 다음 저장에서는 이 카드가 새 id로 찾아온다.
      if (complete) {
        baseline.questions[created.id] = questionFingerprint(
          withResolvedPassage({ ...card, id: created.id }),
        );
      }
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

  /* 4) 문제집 구성 — 뺀 문항과 순서.
   *
   * 캔버스의 🗑 버튼과 드래그는 지금까지 **화면에만** 반영됐다. 저장은 "N개 저장했어요"라고
   * 성공을 알리지만 새로고침하면 지운 문항이 돌아오고 순서도 원래대로였다.
   * (문항 자체를 지우는 게 아니라 이 문제집에서 빼는 것이다 — 문항은 라이브러리에 남는다.)
   *
   * 실패가 하나라도 있으면 둘 다 건너뛴다. 서버가 순서 API에 "빠짐없는 전체 집합"을
   * 요구하는데, 저장 못 한 문항이 있으면 우리 목록이 서버와 다르므로 400이 되고,
   * 그 상태에서 삭제까지 밀어붙이면 사용자가 의도하지 않은 결과가 남는다. */
  const idOf = (c: CanvasCard) => newQuestionIdByCardId[c.id] ?? c.id;
  const liveIds = input.cards.map(idOf).filter(isPersistedCard);
  if (failedCount === 0 && input.compositionKnown) {
    const live = new Set(liveIds);
    for (const goneId of Object.keys(baseline.questions).filter((id) => !live.has(id))) {
      try {
        await client.removeQuestionFromWorkbook(goneId);
        delete baseline.questions[goneId];
      } catch (e) {
        notices.push({ level: 'error', message: `문항을 빼지 못했어요. (${errorText(e)})` });
      }
    }
    if (liveIds.length > 1) {
      try {
        await client.reorderWorkbookQuestions(liveIds);
      } catch (e) {
        notices.push({ level: 'error', message: `문항 순서를 저장하지 못했어요. (${errorText(e)})` });
      }
    }
  } else if (failedCount > 0) {
    notices.push({
      level: 'error',
      message: '저장에 실패한 문항이 있어 순서와 삭제는 반영하지 않았어요.',
    });
  }

  /* 5) 문제집 메타 — 공개 설정(바뀐 경우만) + #키워드(항상 전체 교체). */
  try {
    const { ids: workbookTagIds } = await resolveTagIds(input.workbookKeywords);
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
      // 호출 **전에** 예약한다. 확인과 기록 사이에 await이 있으면, 같은 이미지가 두 카드에
      // 실린 채 병렬 갱신을 타는 순간 두 워커가 나란히 통과해 중복 행이 생긴다 —
      // 이 함수가 막겠다고 한 바로 그 중복이다.
      registered.add(storageUrl);
      try {
        await client.registerImage({ storageUrl, ...target });
      } catch {
        registered.delete(storageUrl); // 다음 저장에서 다시 시도된다
      }
    }
  }
}
