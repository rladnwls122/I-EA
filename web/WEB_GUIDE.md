# 🌐 Frontend Development Guide for AI (IΔEA Web)

이 문서는 IΔEA 프로젝트의 프론트엔드(`web/`) 개발 시 AI가 반드시 준수해야 할 가이드라인입니다. 현재 프로젝트는 **Mock 데이터와 실제 API가 혼재**되어 있으며, **타입 불일치 및 SSR 관련 런타임 오류**가 빈번하므로 아래 규칙을 엄격히 따라야 합니다.

## 🚨 Critical Rules (Must Follow)

### 1. Vega & Chart Components (SSR Restriction)
Vega 관련 라이브러리(`vega`, `vega-lite`, `react-vega`)는 서버 사이드 렌더링(SSR) 시 `canvas` 관련 오류를 발생시킵니다.
- **규칙**: 모든 차트 컴포넌트는 반드시 `next/dynamic`을 사용하여 `ssr: false`로 로드해야 합니다.
- **규칙**: 컴포넌트 내부에서 `typeof window !== 'undefined'` 가드를 사용하여 브라우저 환경임을 이중으로 보장해야 합니다.
- **규칙**: `package.json`의 Vega 버전은 함부로 업데이트하지 마십시오. 현재 Vega 5.x/6.x 하위 호환 버전을 유지해야 합니다.

### 2. Layout & Page Structure
프로젝트는 `app/layout.tsx`에서 전역 사이드바(`AppSidebar`)를 제공하며, 특정 페이지는 병렬 라우트(`@sidebar`)를 사용합니다.
- **규칙**: `AppFrame`과 같은 구형 레이아웃 래퍼는 더 이상 사용하지 않습니다. 페이지는 플랫한 `<main>` 태그로 시작하십시오.
- **규칙**: 페이지 좌측 여백은 `body`에 설정된 `pl-[64px]`(사이드바 너비)에 의해 자동으로 확보됩니다. 중복 여백을 피하십시오.
- **규칙**: `app/notes/layout.tsx`와 같이 병렬 라우트를 사용하는 레이아웃 구조를 수정할 때는 `children`과 `sidebar` 슬롯의 역할을 명확히 구분하십시오.

### 3. API & Data Fetching (Real vs Mock)
`lib/api.ts`와 `lib/hooks.ts`에 실제 API 연동 로직이 구현되어 있으나, 일부 페이지(`app/questions/page.tsx`)는 여전히 `lib/mock-data.ts`를 참조합니다.
- **규칙**: 새로운 기능을 구현하거나 기존 기능을 수정할 때는 반드시 `lib/api.ts`와 `lib/hooks.ts`를 우선적으로 사용하십시오.
- **규칙**: `mock-data.ts`와 `lib/types.ts`의 타입이 서로 다릅니다. (예: `id` 타입이 `number` vs `string`). 타입 에러 발생 시 반드시 `lib/types.ts`를 기준으로 통일하십시오.
- **규칙**: API 호출 시 `localStorage`에서 토큰을 가져오므로, 클라이언트 컴포넌트에서만 API를 호출해야 합니다.

### 4. Rich Text Handling (ProseMirror JSON)
문제 본문(`stem`), 선택지(`choices`), 해설(`explanation`)은 평문이 아닌 **ProseMirror JSON** 형식으로 저장됩니다.
- **규칙**: 데이터를 렌더링할 때는 반드시 `lib/prosemirror.ts`의 `extractPlainText`와 같은 유틸리티를 사용하여 텍스트를 추출하거나, 전용 렌더러 컴포넌트를 사용하십시오.
- **규칙**: 단순 문자열로 취급하여 직접 렌더링할 경우 `[object Object]`가 출력되거나 런타임 에러가 발생합니다.

### 5. Defensive Programming (Runtime Safety)
- **규칙**: `localStorage` 접근 시 반드시 `typeof window !== 'undefined'` 체크를 수행하십시오.
- **규칙**: `new Date(item.viewedAt)`와 같이 날짜 변환 시, 필드 존재 여부를 반드시 확인하십시오. (`item.viewedAt ? ... : ...`)
- **규칙**: `map()` 함수 사용 전 데이터가 배열인지 항상 확인하십시오. (`(data || []).map(...)`)

## 🛠 Common Fix Patterns

### 1. Next Dynamic Import (SSR Off)
```tsx
const DynamicWidget = dynamic(
  () => import('@/components/Widget').then(mod => mod.Widget),
  { ssr: false, loading: () => <Skeleton /> }
);
```

### 2. API Data Usage in Components
```tsx
const { data, isLoading } = useMyNotes();
// 데이터 접근 시 옵셔널 체이닝 필수
const count = data?.wrongQuestions?.length || 0;
```

### 3. Rich Text to Plain Text
```tsx
import { extractPlainText } from "@/lib/prosemirror";
// ...
<h3>{extractPlainText(question.stem)}</h3>
```

## 📂 Key Files to Reference
- `lib/types.ts`: 프로젝트의 단일 진실 공급원(SSOT) 타입 정의
- `lib/api.ts`: 백엔드 통신 명세
- `lib/hooks.ts`: React Query 기반 데이터 상태 관리
- `lib/prosemirror.ts`: 리치 텍스트 처리 유틸리티

이 가이드를 준수하지 않은 코드는 빌드 단계에서 거부되거나 런타임 에러를 유발할 가능성이 매우 높습니다.
