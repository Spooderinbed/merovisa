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
