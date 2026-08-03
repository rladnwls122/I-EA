/**
 * 오답노트 조회 필터 공유 스토어.
 * NotesDashboard(본문)에서 '조회'로 확정한 필터를 @sidebar 슬롯과 공유한다 —
 * 병렬 라우트라 props로 못 넘기므로 스토어 경유.
 * "복습 시작"이 사용자가 적용한 범위를 존중하게 하는 것이 목적.
 * 서버 영속화·localStorage 없음(세션 메모리 전용).
 */
import { create } from 'zustand';

export interface NotesFilter {
  examType?: string;
  examCategory?: string;
  subjectId?: string;
}

interface NotesFilterState {
  applied: NotesFilter;
  setApplied: (filter: NotesFilter) => void;
  reset: () => void;
}

export const useNotesFilterStore = create<NotesFilterState>()((set) => ({
  applied: {},
  setApplied: (filter) => set({ applied: filter }),
  reset: () => set({ applied: {} }),
}));
