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
    // ONE local database, so the suites are serialised rather than merely isolated by fixture.
    // The same reasoning as the exclude above, one level in: `case-backfill.itest.ts` calls
    // `private.mv155_backfill_personal_cases()`, whose population is `auth.users` and whose
    // reconciliation check scans every student-owned row in the database. Run in parallel with the
    // tenancy fixtures it races them both ways — minting a personal case for a user whose own
    // fixture is about to seed one (23505 on `cases_personal_student_idx`), and reconciling over
    // half-seeded rows another file has not yet given a case. Neither failure is a defect in the
    // code under test, and both are intermittent, which is the worst kind of red on a gating lane.
    fileParallelism: false,
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
