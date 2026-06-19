# MV-09 — Replace hardcoded FX rates (one source of truth)

**Priority:** P3   **Owner:** agent
**Goal:** Budget→currency conversion reads ONE source of truth (the canonical
`FX_RATES` table), not divergent inline rate sets. No two code paths convert the
same budget to different numbers.

## Context links
- Best-practice principle §4 "One source of truth per concept": `.claude/plans/tender-bouncing-locket.md`
- Canonical rate table: `lib/data/policy/fx-rates.ts` (units per USD, provenance-stamped, re-exported via `lib/data/scoring-config.ts`).
- Divergent duplicate (the target): `budgetToAud` in `lib/matches/from-sections.ts`.

## Decision
- **Keyless, not a live API.** Recon found NO external FX key/env var and that a live feed isn't required — the canonical `FX_RATES` table already exists, is provenance-stamped, and feeds the financial scorer. The fix routes the match-path converter through it. (The card's "a real lookup" framing is satisfied by a single canonical table; a live API is a larger, key-gated future card.)
- **Scope = the divergent, verdict-relevant converter only.** `budgetToAud` feeds `userBudgetAud` → the match gate (`lib/matches/compute.ts`) on BOTH the signed-in (`from-sections`) and anon (`from-student-profile`) paths. Its inline rates **agree** with canonical on USD/AUD/INR/NGN but **diverge on NPR (÷100 vs canonical-implied ÷90), BDT, PKR** — and NPR is the MVP corridor. Aligning to canonical is an **intended** match-path correction.
- **Out of scope (documented follow-up):** two more `135` literals — `lib/callouts/rules.ts:102` (`budget / 135`) and `components/wizard/steps/budget-step.tsx:11` (`NPR_PER_USD = 135`). Both are **client-reachable** code that deliberately avoids importing the server data layer, and their value already **agrees** with canonical (135), so they are duplicates, not divergences. Consolidating them needs a client-safe FX accessor → a separate hygiene slice.
- **Freshness follow-up (deferred):** the FX provenance is `internal-heuristic`, `lastVerified 2026-06-02`, with NO `reverifyBy`/`volatility`, so it never trips the MV-04 staleness guard despite being volatile + verdict-feeding. Wiring it in is MV-04 territory and would need a deliberate `reverifyBy` (and could turn verdicts amber) — out of this slice.

## Acceptance criteria
- [x] `budgetToAud` derives its conversion from the canonical `FX_RATES` table (no independent rate constants); the "Replace with FX lookup later" TODO is resolved.
- [x] A shared converter (`toAud`) lives next to the rates (`lib/data/policy/fx-rates.ts`) and is unit-tested directly (every currency derives from one table; unmapped/null → passthrough as AUD).
- [x] The intended NPR correction (÷100 → ÷90) is reflected in the two tests that pinned the old value, with a comment citing the canonical source. No silent change.
- [x] Scoring engine goldens byte-identical (the change is in the match path, not the `StudentProfile → engine` path; `financial.ts` untouched). No RULE_VERSION/CONFIG_VERSION bump.
- [x] No external API key or env var introduced; nothing crosses to client JS.

## Test plan
- New `tests/data/fx-rates.test.ts`: `toAud` derives every conversion from `FX_RATES`; NPR via ÷90; unmapped/null → passthrough.
- Update `tests/matches/from-sections.test.ts` + `tests/matches/from-student-profile.test.ts` NPR assertions to the canonical values (RED first against current ÷100).
- Full suite + typecheck + lint green; confirm `golden-assessments.json` unchanged.

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None. Fully agent-ownable (keyless).

## Risk notes
- `budgetToAud` feeds the match gate, so the NPR correction changes match outcomes for NPR budgets (the MVP corridor) — intended, locked by the two updated tests; anon↔signed-in equivalence preserved (both paths use the same converter). Not in the scoring golden.

## Agent resume notes (cold start)
1. Canonical rates: `lib/data/policy/fx-rates.ts` `FX_RATES` (units per USD; AUD 1.5, NPR 135). Add `toAud(amount, currency)` there.
2. Reroute `budgetToAud` (`lib/matches/from-sections.ts`) through `toAud`; keep its null-handling + public signature (consumed by `from-student-profile.ts`).
3. Update the two NPR assertions (from-sections / from-student-profile tests) to canonical (÷90).

## Decision log
- 2026-06-19 — Picked over MV-06 via Codex triangulation + recon: MV-06's "stale-figure correctness bug" premise was disproven (visa fee already AUD 2,000, capacity already AUD 29,710 — both current with 2026-06-07 provenance), and MV-09's "needs a founder FX key" disqualifier was also disproven (keyless canonical table feasible). MV-09 is the verified-better next build: fully ownable, verdict-affecting trust fix, one clean TDD slice.

## Done evidence

**DONE locally 2026-06-19 (NOT pushed; awaiting founder GO). Gate green: typecheck clean, lint 0 errors (only the pre-existing `build.mjs` warning), 1121/1121 tests (+6).** `golden-assessments.json` byte-identical (`git status` reports it unchanged) — no version bump.

- **`lib/data/policy/fx-rates.ts`** — added `toAud(amount, currency)` next to `FX_RATES`: `(amount / rate[cur]) * rate[AUD]`, unmapped/null → passthrough. Single source of truth for budget→AUD.
- **`lib/matches/from-sections.ts`** — `budgetToAud` now delegates to `toAud` (kept null-handling + signature, consumed by `from-student-profile.ts`); the divergent inline switch + "Replace with FX lookup later" TODO removed.
- **`tests/data/fx-rates.test.ts`** (new, 6 tests) — `toAud` derives every currency from `FX_RATES`; NPR via ÷90; unmapped/null passthrough; a property test that 1 USD-worth of each currency → `audPerUsd`. TDD'd (RED first: function missing).
- **`tests/matches/from-sections.test.ts` + `tests/matches/from-student-profile.test.ts`** — NPR assertions updated to canonical ÷90 (3,000,000→33,333; 4,500,000→50,000) with a citing comment. RED first against the old ÷100.
- **Intended diff:** match-path budget→AUD changed for NPR (÷100→÷90, MVP corridor), and incidentally for INR/BDT/PKR (now exactly canonical) — USD/AUD/NGN unchanged. Locked by the updated tests; anon↔signed-in match equivalence preserved (one shared converter). NOT in the scoring golden.
- **Codex adversarial pass** (refute-each): value-neutrality for USD/AUD/NGN, no client-bundle/F16 leak (server-only import chain), no golden impact (`financial.ts` untouched), no other divergent converter missed, passthrough semantics preserved — **all CONFIRMED, no defects.**
- **Follow-ups noted (deferred, not divergent):** the two client-side `135` literals (`callouts/rules.ts:102`, `budget-step.tsx:11`) need a client-safe FX accessor; FX provenance lacks `reverifyBy`/`volatility` so it never trips the MV-04 staleness guard despite being volatile + verdict-feeding.
