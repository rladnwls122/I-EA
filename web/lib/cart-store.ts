/**
 * Pick & Mix 장바구니 스토어.
 * 문제 탐색에서 담은 문항을 유지하며(새로고침에도 persist),
 * 세션 조립(플레이리스트) 또는 문제집 저장의 입력이 된다.
 * 서버 영속화 없음 — localStorage(qidea-cart) 전용.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { CartItem } from './types';

interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) =>
          // 같은 문항 재담기는 무시(중복 방지)
          s.items.some((i) => i.id === item.id) ? s : { items: [...s.items, item] },
        ),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
    }),
    {
      name: 'qidea-cart',
      // SSR 가드: zustand persist가 내부에서 window 접근을 지연 처리하지만,
      // storage를 명시해 클라 전용임을 분명히 한다.
      storage: createJSONStorage(() => localStorage),
      skipHydration: false,
    },
  ),
);
