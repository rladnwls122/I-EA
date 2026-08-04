import type { SessionQuestionSnapshot } from "./types";

/** 화면에 그릴 지문 하나. */
export interface DisplayPassage {
  content: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** 세트에서 이 지문을 부르는 이름 — 수능 "(가)", 토익 "Passage 1". 단일 지문이면 없다. */
  label?: string;
}

/**
 * 세션 스냅샷에서 지문 목록을 꺼낸다 — 신형(`passages`)과 구형(`passage`)을 모두 받는다.
 *
 * 백엔드 `snapshotPassages()`의 짝이다. 스냅샷은 소급 수정하지 않는 기록이라 두 형태가
 * 영원히 공존하고, 화면마다 `?? []`로 분기하면 한 곳을 빼먹는 순간 그 화면에서만
 * 지문이 사라진다. 읽는 입구를 하나로 모은다.
 */
export function sessionPassages(snapshot: SessionQuestionSnapshot): DisplayPassage[] {
  if (snapshot.passages?.length) return snapshot.passages;
  return snapshot.passage ? [{ content: snapshot.passage }] : [];
}
