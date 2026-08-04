import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * web/ 순수 로직 테스트 러너.
 *
 * 그동안 프런트는 `tsc --noEmit`과 `next build`로만 검증됐다. 타입이 맞고 빌드가 되는
 * 것과 로직이 맞는 것은 다른 문제라, 저장 페이로드 조립 같은 규칙을 고칠 때 회귀를
 * 잡을 방법이 없었다(#41 Phase 3의 실제 위험이 여기였다).
 *
 * 범위는 **순수 로직**이다 — jsdom·React 렌더 테스트는 아직 도입하지 않는다.
 * 컴포넌트 테스트가 필요해지면 environment: 'jsdom' + @testing-library를 그때 얹는다.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // jest 스타일 전역(describe/it/expect)을 켠다. 기존 lib/authoring-chat.test.ts가
    // 그 문법으로 쓰여 있고, 백엔드(jest)와 테스트 작성 방식을 맞추는 편이 낫다.
    globals: true,
    // *.test.ts만 잡는다. 백엔드(root jest)는 *.spec.ts라 규칙이 겹치지 않는다.
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
  resolve: {
    // tsconfig의 "@/*" → web 루트 별칭과 같은 매핑.
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
