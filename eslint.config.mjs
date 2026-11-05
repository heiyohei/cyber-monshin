import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // サブエージェントの worktree（中の .next などのビルド成果物を読まないように）と、デモ動画の出力
    ".claude/worktrees/**",
    "demo/out/**",
  ]),
]);

export default eslintConfig;
