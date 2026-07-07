import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web"),
      "@selfchecks/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@selfchecks/db": path.resolve(__dirname, "packages/db/src/index.ts"),
    },
  },
  test: {
    coverage: {
      exclude: [
        "**/dist/**",
        "**/.next/**",
        "**/*.config.*",
        "**/*types.ts",
        "**/next-env.d.ts",
        "vitest.setup.ts",
      ],
      provider: "v8",
    },
    environment: "jsdom",
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
