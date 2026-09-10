import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Next 16에서 `next lint`가 사라져 ESLint 9 flat config로 옮겼다(.eslintrc.json 대체).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // react-hooks v6(React Compiler 기반)가 새로 켠 규칙. 기존 코드 29곳이 걸린다 —
      // 컴파일러를 쓰지 않으므로 당장은 경고로 두고, 손대는 파일부터 고친다.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  { ignores: [".next/**", "next-env.d.ts"] },
]);
