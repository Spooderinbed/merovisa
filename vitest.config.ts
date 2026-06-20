import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    css: false,
    // Agent worktrees under .claude/ are full repo copies — never collect their tests.
    // *.itest.ts files run against a real local Supabase stack via
    // vitest.integration.config.ts (npm run test:integration), never in `npm test`.
    // (Plain tests/integration/*.test.ts are module-level, need no DB, and stay here.)
    exclude: [...configDefaults.exclude, "**/.claude/**", "**/*.itest.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
