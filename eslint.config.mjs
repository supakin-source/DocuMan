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
    // The Claude Design export kept for reference. Not built, not shipped —
    // it is the spec the app is implemented against, so it stays as authored.
    "design/**",
    // Emitted by `prisma generate`; regenerated on install.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
