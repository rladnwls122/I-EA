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
 *
 * 주입 구조로 만들어 둔 덕에 **배치 엔드포인트가 생겼을 때 어댑터 교체로 흡수됐다**.
 * 예전엔 문항 하나당 3회(생성·발행·담기) 또는 1회(갱신)가 나가서 20문항 첫 저장이
 * 60회를 넘었다. 지금은 생성도 갱신도 묶음당 한 번이고, 순서는 서버가 지킨다 —
 * 그래서 "새 문항은 순서 때문에 순차로 돌린다"는 제약 자체가 사라졌다.
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
 * 배치 응답의 항목 하나. 이 계약의 전부는 "서버가 **항목별로** 성패를 돌려준다"는 것이다 —
 * 전부 성공 아니면 전부 실패로 뭉개지면, 실패한 문항만 다음 저장에서 다시 시도하는
 * 기준선 규칙이 통째로 무너진다.
 *
 * `index`는 보낸 배열에서의 자리다. 응답 순서에 기대지 않고 되짚기 위한 것.
 */
export interface SaveBatchItem {
  index: number;
  /** 성공 시 — 만들어졌거나 갱신된 문항 id. */
  questionId?: string;
  /** 실패 시 — 사용자에게 그대로 보여도 되는 사유. */
  error?: string;
}

/**
 * 저장이 쓰는 서버 호출의 전부. 이름은 API 경로가 아니라 **의도**로 짓는다 —
 * 이 모듈은 어떤 엔드포인트가 있는지 알 필요가 없다.
 */
export interface SaveClient {
  /**
   * 한 번에 보낼 수 있는 문항 수. 서버가 정하는 값이라 어댑터가 알려 준다 —
   * 이 모듈이 API 상수를 직접 읽으면 "네트워크를 모른다"는 경계가 깨진다.
   * 넘는 만큼은 나눠 보내되, 생성은 **순차**여야 한다(순서가 곧 문제집 순서다).
   */
  readonly batchLimit: number;
  createPassage(content: unknown): Promise<{ id: string }>;
  publishPassage(id: string): Promise<unknown>;
  updatePassage(id: string, content: unknown): Promise<unknown>;
  /** #키워드 카테고리의 기존 태그 전체. */
  listKeywordTags(): Promise<{ id: string; name: string }[]>;
  createKeywordTag(name: string): Promise<{ id: string }>;
  /**
   * 문항을 한 번에 만들어 **발행하고 문제집에 담는다**. 보낸 순서가 곧 문제집 순서다.
   * (예전의 생성 → 발행 → 담기 3회 × N이 이 한 번이다.)
   */
  createQuestionsBatch(payloads: unknown[]): Promise<SaveBatchItem[]>;
  /** 문항을 한 번에 갱신한다. (예전의 PATCH × N.) */
  updateQuestionsBatch(items: { id: string; payload: unknown }[]): Promise<SaveBatchItem[]>;
  removeQuestionFromWorkbook(questionId: string): Promise<unknown>;
  /** 문제집 **전체** 문항 순서. 서버가 빠짐없는 집합을 요구한다. */
  reorderWorkbookQuestions(questionIds: string[]): Promise<unknown>;
  updateWorkbook(patch: {
    tagIds: string[];
    visibility?: 'PUBLIC' | 'PRIVATE';
  }): Promise<unknown>;
  /**
   * 한 번에 보낼 수 있는 이미지 등록 수. 문항 배치와 값이 다르다(이미지가 더 많이 나온다).
   */
  readonly imageBatchLimit: number;
  /**
   * 이미지를 한 번에 등록한다. (예전의 `POST /media-assets` × 장수.)
   * 결과는 항목별 — 등록에 실패한 이미지만 기준선에서 빼 다음 저장에서 다시 시도한다.
   */
  registerImagesBatch(
    items: { storageUrl: string; questionId?: string; passageId?: string }[],
  ): Promise<SaveBatchItem[]>;
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

/* ── 보조 ────────────────────────────────────────────────────────── */

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 배치 상한만큼 잘라 나눈다. 상한이 0 이하면 나누지 않는다(방어). */
function chunked<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length ? [items] : [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
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
  /**
   * 이번 저장에서 등록할 이미지들. 지문·문항 어느 쪽에 붙든 한 줄에 모았다가
   * 마지막에 배치로 보낸다 — 지문 이미지만 따로 보내면 왕복이 다시 둘로 갈린다.
   */
  const pendingImages: { storageUrl: string; questionId?: string; passageId?: string }[] = [];

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
        queueImages(collectImageSrcs(passage), { passageId: groupId });
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
      queueImages(collectImageSrcs(passage), { passageId: created.id });
    } catch (e) {
      notices.push({
        level: 'error',
        message: `지문 저장에 실패했어요 — 해당 문항은 지문 없이 저장됩니다. (${errorText(e)})`,
      });
    }
  }

  /* 2) #키워드 → 태그 find-or-create. 목록은 한 번만 받아 이름으로 재사용한다.
   *
   * 값이 아니라 **약속(Promise)**을 담는다. 값을 담으면 "조회 → await 생성 → 기록" 사이에
   * 다른 워커가 끼어들어(갱신은 4-병렬이다) 같은 태그를 인원수만큼 만든다. 약속을 먼저
   * 꽂아 두면 뒤따라온 워커는 이미 나가 있는 그 호출을 기다린다.
   * 실패한 약속(null)도 그대로 남긴다 — 한 번 실패한 이름을 카드 수만큼 다시 때리지 않는다. */
  const tagIdByName = new Map<string, Promise<string | null>>();
  try {
    for (const t of await client.listKeywordTags()) {
      tagIdByName.set(t.name.trim().toLowerCase(), Promise.resolve(t.id));
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
      let pending = tagIdByName.get(key);
      if (!pending) {
        // 예약을 await **전에** 꽂는다 — 이게 이 함수의 유일한 경합 방어다.
        pending = client
          .createKeywordTag(name)
          .then((t) => t.id)
          .catch(() => null);
        tagIdByName.set(key, pending);
      }
      const id = await pending;
      if (!id) {
        complete = false; // 이 키워드만 건너뛰고 나머지는 계속
        continue;
      }
      ids.push(id);
    }
    return { ids, complete };
  };

  /* 3) 문항 — 갱신도 생성도 묶음당 한 번. 순서는 서버가 지킨다. */
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


  /**
   * 페이로드를 배치 **전에** 다 만든다. 태그 해석이 비동기라 카드마다 await이 끼는데,
   * 배치가 되면서 그 await들을 한 번에 겹쳐도 되는 자리가 됐다 — 예약 맵(tagIdByName)이
   * 같은 태그를 두 번 만들지 않게 이미 막고 있다.
   */
  const buildPayloads = async (cards: CanvasCard[]) => {
    const built = await Promise.all(cards.map(payloadFor));
    return cards.map((card, i) => ({ card, ...built[i] }));
  };

  /** 배치 응답을 index로 되짚는다. 응답에 없는 항목은 **실패로 본다**(성공으로 치면 기준선이 박힌다). */
  const resultAt = (results: SaveBatchItem[], index: number): SaveBatchItem | undefined =>
    results.find((r) => r.index === index);

  /* 3a) 갱신 — 묶음당 한 번. 묶음끼리는 서로 순서에 영향을 주지 않아 순서 제약이 없다. */
  for (const chunk of chunked(await buildPayloads(toUpdate), client.batchLimit)) {
    let results: SaveBatchItem[];
    try {
      results = await client.updateQuestionsBatch(
        chunk.map((e) => ({ id: e.card.id, payload: e.payload })),
      );
    } catch (e) {
      // 배치 자체가 못 나갔다(네트워크·400). 이 묶음은 통째로 실패다 — 기준선은 그대로 둔다.
      failedCount += chunk.length;
      lastError = errorText(e);
      continue;
    }
    chunk.forEach(({ card, complete }, i) => {
      const r = resultAt(results, i);
      if (!r || r.error || !r.questionId) {
        failedCount += 1;
        lastError = r?.error ?? '서버가 이 문항의 결과를 돌려주지 않았어요.';
        return;
      }
      savedCount += 1;
      // 태그를 다 못 붙였으면 기준선을 세우지 않는다 — 다음 저장이 다시 시도해야 한다.
      if (complete) baseline.questions[card.id] = questionFingerprint(withResolvedPassage(card));
      queueImages(cardImageSrcs(card), { questionId: card.id });
    });
  }

  /* 3b) 생성 — 만들고 발행하고 담는 것까지 묶음당 한 번.
   *
   * 묶음은 **순차**로 보낸다. 담기는 순서가 곧 문제집 순서라 뒤 묶음이 먼저 도착하면
   * 순서가 뒤집힌다. 한 묶음 **안의** 순서는 서버가 보낸 순서대로 매겨 준다 —
   * 그래서 예전처럼 문항 하나씩 순차로 돌 이유가 없어졌다. */
  for (const chunk of chunked(await buildPayloads(toCreate), client.batchLimit)) {
    let results: SaveBatchItem[];
    try {
      results = await client.createQuestionsBatch(
        chunk.map((e) => ({ subjectId: input.subjectId, ...e.payload })),
      );
    } catch (e) {
      failedCount += chunk.length;
      lastError = errorText(e);
      continue;
    }
    chunk.forEach(({ card, complete }, i) => {
      const r = resultAt(results, i);
      if (!r || r.error || !r.questionId) {
        failedCount += 1;
        lastError = r?.error ?? '서버가 이 문항의 결과를 돌려주지 않았어요.';
        return;
      }
      savedCount += 1;
      newQuestionIdByCardId[card.id] = r.questionId;
      // 기준선은 **새 id** 기준으로 남긴다 — 컴포넌트가 카드 id를 교체하므로
      // 다음 저장에서는 이 카드가 새 id로 찾아온다.
      if (complete) {
        baseline.questions[r.questionId] = questionFingerprint(
          withResolvedPassage({ ...card, id: r.questionId }),
        );
      }
      queueImages(cardImageSrcs(card), { questionId: r.questionId });
    });
  }

  await flushImages();

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
   * 이번에 새로 들어온 이미지를 등록 대기줄에 넣는다 (#33 도그푸딩 잔여 3).
   *
   * 예전에는 여기서 곧바로 `POST /media-assets`를 불렀다(제한 병렬 4). 문항 저장이
   * 배치가 된 뒤로는 남은 왕복의 대부분이 이 호출이었다 — 그림 20장이면 20회다.
   * 지금은 모아 두었다가 마지막에 한 번(또는 상한만큼 나눠) 보낸다.
   *
   * 대기줄에 넣는 시점에 `registered`를 **미리 채운다**: 같은 그림이 여러 카드에 실려
   * 있어도 한 번만 보내기 위해서다. 실패한 항목만 flush에서 도로 뺀다.
   */
  function queueImages(
    srcs: string[],
    target: { questionId?: string; passageId?: string },
  ): void {
    for (const storageUrl of srcs) {
      if (registered.has(storageUrl)) continue;
      registered.add(storageUrl);
      pendingImages.push({ storageUrl, ...target });
    }
  }

  /**
   * 모인 이미지를 등록한다. 실패해도 저장을 실패로 만들지 않는다 — 등록은 자원 목록
   * (media_assets)을 채우는 부수 작업이고, 이미지 자체는 문서의 src로 이미 살아 있어
   * 화면에는 정상적으로 보인다. 실패한 것만 기준선에서 빼 다음 저장이 다시 시도한다.
   */
  async function flushImages(): Promise<void> {
    for (const chunk of chunked(pendingImages, client.imageBatchLimit)) {
      let results: SaveBatchItem[];
      try {
        results = await client.registerImagesBatch(chunk);
      } catch {
        // 배치 자체가 못 나갔다 — 이 묶음은 통째로 다음 저장에서 다시 시도한다.
        for (const item of chunk) registered.delete(item.storageUrl);
        continue;
      }
      chunk.forEach((item, i) => {
        const r = results.find((x) => x.index === i);
        // 결과가 없거나 실패면 등록되지 않은 것으로 본다(성공으로 치면 영영 재시도되지 않는다).
        if (!r || r.error) registered.delete(item.storageUrl);
      });
    }
    pendingImages.length = 0;
  }
}
