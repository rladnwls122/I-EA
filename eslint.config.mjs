// @ts-check
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

/**
 * ESLint 플랫 설정.
 *
 * ESLint 10에서 `.eslintrc.*` 지원이 제거되어 옮겨 왔다. 규칙 구성은 예전
 * `.eslintrc.js`와 **의도적으로 동일**하다 — 프레임워크 업그레이드 커밋에서
 * 린트 규칙까지 같이 바꾸면 새로 뜬 경고가 업그레이드 때문인지 규칙 때문인지
 * 구분할 수 없게 된다. 규칙을 조일 거면 별도 커밋으로.
 */
export default [
  {
    // 예전 ignorePatterns. 플랫 설정에서는 ignores만 있는 객체가 전역 무시가 된다.
    // (.eslintrc.js 자체를 무시하던 항목은 파일이 사라졌으므로 함께 없앴다.)
    ignores: ['dist/**', 'node_modules/**', 'web/**', 'prisma/seed.ts'],
  },
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Json 컬럼 쓰기용 국소 `type JsonWritable = any` 패턴을 허용한다.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
