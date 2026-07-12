# IΔEA UI 리디자인 — 디자인 시스템 스펙 (2026-07-12)

인트로(`app/intro/`) 제외 전 페이지를 "정밀 계기(precision instrument)" 다크로 통일한다.
기존 다크·에메랄드 정체성은 유지하고(인트로와 연속성), **실행 품질**로 차별화한다.
근거: `docs/superpowers/specs/ux.md` (Duolingo UX 분석 — 물리 버튼, 다중 채널 피드백, focus-width, 모션 위계).

## 이미 완료된 것 (건드리지 말 것)

- `app/globals.css` — 토큰 사다리, `.pressable`, `.surface-sheen`, `.reward-pop`
- `tailwind.config.ts` — `shadow-surface`, `shadow-key`, `ease-swift`, `ease-spring`, `streak` 색
- `components/ui/` button·card·input·badge·tabs — 새 프리미티브. **API 불변, 재수정 금지**

## 토큰 (전부 CSS 변수 — 하드코딩 hex 금지)

| 역할 | 클래스 |
|---|---|
| 표면 사다리 | `bg-background` → `bg-card` → `bg-surface-raised` → `bg-popover` (한 단계씩만 위로) |
| 호버 표면 | `bg-accent` |
| 보더 | `border-border` 헤어라인 하나만. 이중 보더 금지 |
| 행동/정답 | `text-primary` `bg-primary` (emerald) |
| AI 관련 | `text-purple` (violet) — AI 생성·채팅에만 |
| 오답/위험 | `text-wrong` `text-destructive` |
| 스트릭/보상 | `text-streak` (amber) |
| 보조 텍스트 | `text-muted-foreground` |

## 규칙

1. **숫자는 전부 `font-mono`** (정답률·조회수·난이도·점수·타이머·통계). tabular-nums 자동.
2. **터치 타깃 44px+**: 리스트 행·버튼·선지 등 인터랙티브 요소 최소 `h-10`, 풀이 화면 선지는 `min-h-[52px]`.
3. **모션 위계**: 기능 피드백 `duration-150 ease-swift` (색·보더만, 이동 최소). 마일스톤(제출 완료·채점 결과)만 `.reward-pop`. hover에 scale/translate 남발 금지 — 카드 hover는 `hover:border-[색]/40` + `hover:bg-accent` 정도.
4. **`prefers-reduced-motion`**: 새 keyframe 애니메이션 추가 시 반드시 reduce 가드. 기존 유틸(.pressable/.reveal/.reward-pop)은 이미 처리됨.
5. **포커스**: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` — 절대 outline-none 단독 금지.
6. **focus-width**: 풀이·읽기 플로우 본문 컬럼 `max-w-[680px] mx-auto` 기준(이미 그렇다면 유지). 대시보드 등 멀티컬럼은 예외.
7. **선택 상태는 이중 채널**: 색 + 체크 아이콘 or 보더 두께, 색 단독 금지 (접근성).
8. **상태별 화면**: 로딩은 `Skeleton`(실제 레이아웃 모양), 빈 화면은 "행동 초대" (아이콘 + 한 줄 + CTA 버튼), 에러는 원인 + 재시도 버튼. 셋 다 무드성 문구 금지.
9. **카피**: 능동태, 문장형 대소문자, 버튼은 결과를 그대로 ("저장" 아닌 "변경사항 저장" 수준으로 구체적). 한국어 유지.
10. **Vega 차트**: `next/dynamic` + `ssr:false` 유지, 버전 승격 금지. 차트 색은 `--chart-*`.

## 금지

- 새 hex 색 추가 (토큰만 사용)
- 그라데이션 배경 남발 (ambient glow는 기존 .glass-* / .marking-aurora만)
- 로직·데이터 흐름·API 호출·props 시그니처 변경 — **스타일만** 바꾼다
- 인트로 페이지(`app/intro/`) 수정
- shadcn ui 프리미티브(`components/ui/`) 재수정
- 이모지 장식, 불필요한 wrapper div

## 시그니처 (이미 프리미티브에 내장)

primary 버튼 = 눌리는 키 (`shadow-key` + active 1.5px 하강). 페이지 코드에서 따로 흉내내지 말 것 — `<Button>` 쓰면 자동.
