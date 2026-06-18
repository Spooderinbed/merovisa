# EXECUTION CHECKPOINT — read this first on resume (2026-06-18)

**Mandate (durable, user-granted):** Work autonomously through all phases with NO confirmations. Manage context budget myself — checkpoint to disk + compact at phase boundaries so auto-compaction never cuts off work. Between phases, discuss results + plan with Codex (`codex:codex-rescue`) and adapt the plan if warranted. After the planned phases, hunt for additional fixes/pending tasks. For anything new, do best practice. Deliver a full report at the very end.

**Authoritative plan:** `C:\Users\thapa\.claude\plans\tender-bouncing-locket.md` (Phase 0 / 1 / 2). **Round-1 audit:** `docs/audits/2026-06-18-full-app-evaluation.md`. **Supabase project id:** `obfvrxixtautamflzxzq` (Postgres 17). **Working branch:** `feat/context-budget`. **Do NOT push to remote** without a final nod (only outward-facing step held back); local merges are fine.

## Phase 0 status — ✅ COMPLETE
Merged to `feat/context-budget` @ `496306b`; full suite **1035 tests green** (typecheck+lint clean). NOT pushed. Supabase advisor migration authored (`supabase/migrations/20260618120000_harden_advisors.sql`) but live-DB apply was **blocked by the auto-mode classifier** → needs explicit approval or a dev-branch run (idempotent/reversible; safe). Auth leaked-password protection = manual dashboard step (pending). Category-E DHA figures **verified current** (living 29,710; visa charge 2,000) → no stale-figure fix needed.

## Phase 1 wave 1 — ✅ INTEGRATED
Dashboard cleanup (fake journey + empty updates removed), English test-type (+ PTE/TOEFL→IELTS conversion, goldens byte-identical), Results IA (gov panels → "Know before you go" disclosure) — all merged to `feat/context-budget`; **1064 tests green**. Conflicts resolved: `lib/matches/from-sections.ts` (target-level + ielts-equiv combined) and `components/results/results.tsx` (ConversionPrompt kept + disclosure reorg). NOTE: worktrees branch from `c21ef1a` (pre-Phase-0) so each wave needs small conflict resolution on shared files.
NEXT: wave 1b = scholarships tab + program-notes (dispatched). Then deferred/larger items → final report. Remaining Phase-1: cost-estimate (BLOCKED on OSHC sourcing), data-freshness UX + CI staleness, ledger slice E. Round-1 leftovers: work-input dead field, swallowed errors, FX hardcoding, anonymous matcher still unfiltered (two-engine consolidation = Phase 2).

## ✅ AUTONOMOUS PUSH COMPLETE — Phase 0 + Phase 1 shipped (2026-06-18)
9 slices merged to `feat/context-budget`; **full suite 1075 tests green**, typecheck + lint clean. NOT pushed to remote.
- Phase 0: GPA normalize (RULE_VERSION v0.5.0), conversion/auth CTA + unlock-gate fix, doc re-score no-op removed, matches field/level filter.
- Phase 1: dashboard cleanup, English test-type (+PTE/TOEFL→IELTS conversion), results IA "Know before you go" disclosure, scholarships tab (real data), program-notes caveat. (+ one stale matches-page test updated.)

**TWO ACTIONS AWAIT EXPLICIT USER GO** (outward-facing / classifier-gated):
1. `git push` of `feat/context-budget` (and/or open a PR).
2. Apply `supabase/migrations/20260618120000_harden_advisors.sql` to the DB (or dev-branch run) + enable Auth leaked-password protection in the dashboard.

**DEFERRED (see final report):** cost-estimate (needs OSHC sourcing), data-freshness UX, work-input dead field, swallowed-error surfacing, FX rates. **Phase 2:** CRICOS scrape pipeline, consolidate the 2 match engines (anonymous results still unfiltered), plan-vs-checklist model, backups/PITR/secrets, outcome-validation loop, monetization + legal/disclaimers, AI guide.

### Original Phase 0 dispatch detail

Four disjoint TDD slices were run as background worktree agents (each committed in its own branch; NONE merged yet):

| Slice | Branch | Files | Status |
|---|---|---|---|
| Remove document re-score no-op | `worktree-agent-a578cd5da37738cc2` | `app/api/documents/upload/route.ts`, `app/api/documents/[id]/route.ts`, tests | ✅ DONE, gate green |
| Conversion + auth gate | `worktree-agent-a53ff17cd1057f2e2` | `lib/auth/start-claim-oauth.ts` (new), `components/results/{results,university-matches,conversion-paths,conversion-prompt}.tsx`, tests | ✅ DONE, 1009 tests green |
| Matches field/level filter | `worktree-agent-a7777641ee7a88310` | `lib/matches/{compute,from-sections,types}.ts`, tests | ✅ DONE, 1012 tests green |
| GPA scoring fix | agentId `a71fcacfa231eed1d` (branch reported on completion) | `lib/scoring/academic.ts` (+ helper), maybe `golden-assessments.json`, tests | ⏳ RUNNING |

## Integration steps remaining (do in a clean/compacted context)

1. **Merge the 3 green branches** into `feat/context-budget` (disjoint files → clean). Working tree has pre-existing unstaged changes (CLAUDE.md, tests/integration/wizard-to-results.test.tsx) NOT touched by agents — don't disturb them; merges shouldn't conflict. After merging, run the gate once: `npm run typecheck` && `npm run lint` && `npm test`.
2. **GPA branch:** when it reports, review the `golden-assessments.json` diff deliberately (CGPA fixtures should now score correctly; percentage fixtures should be byte-identical), confirm version-bump decision, then merge + gate.
3. **Supabase advisor migration** (author a new `supabase/migrations/*.sql`): (a) harden `private.set_updated_at` with `set search_path = ''`; (b) add index on `user_program_state(program_id)`; (c) rewrite `documents` RLS policies to use `(select auth.uid())`. Plus: enable Auth leaked-password protection (dashboard/Auth setting — note if not doable via migration); add a comment documenting `leads` RLS-no-policy intent. Apply to a Supabase **dev branch** first, re-run `get_advisors` (security+performance), confirm the 3 items clear, confirm seed-migration-parity test still passes.
4. **Category-E figure check (verify, don't assume):** confirm the scorer + cost panels use CURRENT DHA figures (living capacity AUD 29,710; Subclass 500 charge AUD 2,000). Prior evidence says both are current → the ledger's "710→1600" finding is likely already superseded. If current, mark done; if stale, fix.
5. **Codex checkpoint:** summarize Phase-0 results to `codex:codex-rescue`; confirm/adjust Phase 1 ordering.

## Then: Phase 1 (per plan §5)
Scholarships tab (over existing data) · scope cost-estimate tab (source OSHC first) · English test-type field + test→IELTS map · surface program `notes` · fix/drop dashboard "Your journey" + RecentUpdates · results-page progressive disclosure · ledger slice E (+I) integration · data-freshness UX + CI staleness check. Run as disjoint TDD worktree waves; checkpoint + (let) compact between sub-waves.

## Then: Phase 2 + "look for more"
CRICOS/evidence scrape pipeline + new tables · consolidate the two match engines · Plan-vs-Checklist model · backups/PITR + secrets · outcome-validation loop · monetization + legal/disclaimer questions · AI guide last. Plus: sweep for additional fixes (the round-1 audit's P1/P2 items not yet covered, e.g. work-input dead field, swallowed errors, FX hardcoding).
