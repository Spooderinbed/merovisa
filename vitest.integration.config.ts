import { defineConfig } from "vitest/config";
import path from "path";

// Integration tests run against a REAL local Supabase stack (Docker), not mocks.
// They are intentionally kept out of the default `npm test` (see vitest.config.ts
// exclude) and gated on env vars so they SKIP — never fail — when the stack is down.
// Run with: npm run test:integration (after `npx supabase start`, with
// SUPABASE_TEST_URL + SUPABASE_TEST_SERVICE_ROLE_KEY set; see the file header).
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.itest.ts"],
    // Agent worktrees under .claude/ are full repo copies — never collect their tests,
    // matching vitest.config.ts. Without this, N worktrees means N copies of the same
    // itest running in parallel forks against ONE local database; for the anon-purge
    // smoke, whose purge is global and takes no id filter, the copies delete each
    // other's fixtures and fail intermittently.
    exclude: ["**/node_modules/**", "**/.claude/**"],
    globals: true,
    // Real network round-trips to Postgres are slower than unit assertions.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
