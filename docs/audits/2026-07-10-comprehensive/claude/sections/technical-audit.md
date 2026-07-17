# Technical Audit — LandingPad (MeroVisa)

_Auditor: staff engineer · 2026-07-10 · repo HEAD `d7347e3`_

Scope: incomplete features, tech debt, architecture, security (RLS / service-role / injection / rate-limit / secrets), scalability to 100k+, missing validation/error handling, DB/API/state issues. Every claim below was grep/read-verified against the tree, not the ground-truth brief.

## Headline

The codebase is unusually disciplined for an MVP: ~297 real test files, hand-rolled provenance on every datum, service-role writes fenced behind explicit `.eq("owner", …)`, honest degradation paths everywhere. The scoring engine is genuinely server-side and the anonymous-recovery predicate is correctly gated. That raises the bar for what counts as a finding, so this section is deliberately narrow and concrete. The real risks are (1) **one wrong-direction scoring bug that surfaces nonsense to non-IELTS users**, (2) **no production error monitoring despite the stack claiming Sentry**, (3) **request-time cost that re-reads the full catalogue 2–3× per assessment with zero caching**, and (4) **operational/compliance gaps** (no CSP, missing env docs, inert-but-shipped outcome tables with leftover prod rows).

---

## Findings

### P1 — profile-strength credits raw non-IELTS scores as if they were IELTS bands
`lib/scoring/profile-strength.ts:15-18` and `:46-56` compare `profile.englishScore >= 7.5 / >= 7.0` as a **raw** score. But `englishScore` is "the score in the chosen test's scale" (`lib/scoring/types.ts:36`) and validation allows `0–120` (`lib/validation/profile.ts:33`) to cover TOEFL (0–120) and PTE (0–90). `visa.ts:54` correctly normalizes via `toIeltsEquivalent(score, test)`; profile-strength does **not**. Consequences:

- **Every PTE/TOEFL taker gets the maximum `+8` "strong English" bonus regardless of proficiency.** A PTE 50 (≈ IELTS 4.5, *below* the DHA visa floor) satisfies `50 >= 7.5` → `+8` to profile-strength.
- The results UI then renders the factor label **`Strong English (50.0)`** (`profile-strength.ts:52`, `${profile.englishScore.toFixed(1)}`) — a visibly nonsensical, trust-breaking string in a product whose entire pitch is calibrated honesty. A TOEFL taker sees `Strong English (100.0)`.
- Anonymous-vs-signed-in divergence compounds it: the same person can get different profile-strength depending on which test they entered.

This is not the "known asymmetry" hand-waved in the brief — it is a wrong-direction bug plus broken copy. **Fix:** route through `toIeltsEquivalent` exactly as `visa.ts` does; add a regression test with a PTE/TOEFL profile asserting the bonus and label track the IELTS-equivalent, not the raw number. **Effort: ~1–2 h.**

### P1 — No production error monitoring wired
`CLAUDE.md` and `.env.example` list Sentry, but `grep -c sentry package.json` → **0**; no `@sentry/*` dependency, no `instrumentation.ts`, no import anywhere. For a live product on Vercel auto-deploy from `master`, this means **server exceptions in API routes surface only as `console.error` into Vercel function logs** — no alerting, no aggregation, no release tagging. The many `console.error(...)` swallow-and-continue sites (`/api/assess`, `claim.ts`, rate-limit fail-open) are invisible unless someone reads raw logs. BetterStack is also not in code (external dashboard only). **This is the single biggest operational gap:** a scoring or persistence regression can ship to production and degrade silently. **Fix:** add `@sentry/nextjs`, wire `instrumentation.ts` + client config, tag by `RULE_VERSION`. **Effort: ~half day.**

### P2 — Request-time catalogue re-reads: 2–3 full-table scans per assessment, no caching
`POST /api/assess` (`app/api/assess/route.ts`) fetches the entire program + university catalogue via `listAllPrograms`/`listAllUniversities` — each a `.from("programs").select("*").order("name")` with **no limit/pagination** (`lib/programs/repo.ts:8-11`). For a signed-in user it then calls `reScoreAssessment` (line 115), which **fetches the full catalogue AGAIN** (`lib/assessments/re-score.ts:20-25`) and re-runs `assembleAssessment` (matching) a second time. So a single signed-in assess request does: catalogue fetch #1 (line 58-62), `assembleAssessment` #1 (line 67), then re-score's catalogue fetch #2 + `assembleAssessment` #2 — plus it instantiates **two admin clients** per request (line 58 `catalogDb`, line 74 `adminDb`). At today's ~64 programs this is cheap, but:

- The catalogue is near-static (rows carry `last_verified` dates) yet is re-fetched on **every** `/api/assess`, `/matches`, and re-score with zero caching. This is pure, avoidable DB load that scales linearly with traffic, not with data.
- The double-scoring for signed-in users is wasted CPU: the payload assembled at line 67 is discarded and recomputed by re-score.

**Fix:** cache the catalogue in-process with a short TTL (or Next `unstable_cache`/ISR) keyed on a data-version stamp; skip the redundant `assembleAssessment` when re-score will immediately recompute. **Effort: ~half day.** This is the main thing standing between "fine" and "100k users hammering Postgres."

### P2 — `/api/results/sign-claim` is an unauthenticated, unrate-limited token oracle
`app/api/results/sign-claim/route.ts` mints an HMAC claim token for **any** well-formed UUID (regex-only, line 14) with **no auth, no existence check, no ownership check, no rate limit**. The actual binding is correctly guarded downstream — `claimAssessment` (`lib/assessments/repo.ts:49-57`) updates only `WHERE owner IS NULL AND expires_at > now`, so a token cannot steal a claimed assessment. **So this is not a P0 account-takeover.** But it remains: (a) a free HMAC-signing oracle an attacker can hammer unbounded (CPU/DoS, and a stream of valid-forever-for-24h tokens); (b) a theoretical race where an attacker who *learns* a victim's unguessable anon UUID (e.g. via a leaked/shared results URL, referrer, or shoulder-surf) can claim it to their own Google account before the victim signs in — binding a stranger's assessment PII to the attacker. **Fix:** rate-limit by IP, and reject UUIDs that don't correspond to an existing unclaimed row. **Effort: ~2 h.**

### P2 — Rate limiting fails **open** and is absent from most state-mutating routes
`lib/rate-limit/upstash.ts:43,49` returns `true` (allow) both when Upstash env vars are unset **and** when the limiter throws. If Upstash is unconfigured/misconfigured in prod — plausible given `UPSTASH_*` are optional and undocumented failure modes — **every rate limit silently disappears** with only a `console.error` (which nothing is watching; see Sentry finding). Compounding: only 4 routes are limited (assess, leads, guide/chat, documents/upload). **Unlimited authed mutators** include `profile/section` (triggers re-score + plan invalidation), `plan/action`, `shortlist`, `documents/status`, `assess/refresh`, `outcomes/*`, and `account/delete` — each does DB writes and several trigger a full re-score. A single authenticated user can drive unbounded re-scoring load. IP keys also derive from client-controllable `x-forwarded-for[0]` with literal `"unknown"` fallback (shared bucket). **Fix:** decide fail-open vs fail-closed explicitly per route; add per-user limits to the re-score-triggering mutators. **Effort: ~half day.**

### P2 — No Content-Security-Policy header on a trust-first product
`next.config.ts` sets 5 baseline headers (`grep -c Content-Security-Policy next.config.ts` → **0**). For a product that renders LLM output (the guide) and user-supplied profile text, the absence of a CSP is the weakest link in the header posture. The guide's anti-injection (single unverified user block, never re-emitting `role:"assistant"`) is good defense in depth, but CSP is the browser-side backstop against any XSS that slips through. **Fix:** add a `script-src 'self'`-based CSP (PostHog is lazy-loaded, so the allowlist is small). **Effort: ~2–4 h incl. testing PostHog.**

### P3 — Two independent verdict systems can visibly contradict each other
The dimension engine (`mapVerdict`, `verdict.ts`) and the per-program match verdict (`compute.ts` `computeOne`, thresholds `gradeGap>10 / englishGap>1 / tuition 0.5`) are entirely separate. A student can see **"Possible" overall but "Reach" on every single match**, or vice versa, with no reconciling copy. Not a bug, but a coherence gap that undercuts the "honest single answer" promise. **Fix:** a one-line reconciling note when the two disagree, or surface the relationship. **Effort: ~half day (mostly copy).**

### P3 — Scoring config + gap thresholds + FX leak into the client bundle
`CLAUDE.md` says "Never expose scoring rules in client JS." Mostly upheld — the engine and `VERDICT_CUTOFFS`/`DIMENSION_WEIGHTS` are server-only. But `budget-step.tsx:11` imports `FX_RATES, toAud` from `lib/data/policy/fx-rates`, `use-wizard-state.ts:5` imports `computeGapYears, GAP_REQUIRES_REASON_THRESHOLD`, and `money-scholarships-editor.tsx:9` pulls a sourced data module (`au-financial-evidence`, 88 lines) into a client component. These are minor (FX rates and gap logic aren't secret, and tree-shaking keeps `lib/data` — 113 files / 809 KB — from shipping wholesale), but they are the pattern-level erosion of the rule. The 832 KB findings JSONL lives under `docs/` and is not bundled (verified). **Fix:** move the client-needed FX/gap helpers into a small client-safe module, keep policy/config server-side. **Effort: ~2 h.**

### P3 — Manual, unenforced auth gating (no middleware guard)
There is no `middleware.ts`; `proxy.ts` only refreshes cookies. Gating is per-layout + per-page: `app/(app)/layout.tsx` redirects, and **all 10** `(app)` pages independently re-check `auth.getUser` (verified: 10 files). This defense-in-depth is currently correct, but it is a convention, not a guarantee — a future `(app)` route that omits the check would be silently ungated. **Fix:** keep the layout gate as the single chokepoint and add a lint/test asserting every `(app)` page or the layout enforces it. **Effort: ~2 h.**

### P3 — Inert-but-shipped outcome tables with leftover production rows
The MV-08 "moat" migration (`20260620000000_add_outcome_validation.sql`) and `lib/outcomes/**` (predict/verify/state-machine/repo) are shipped, and API routes exist (`outcomes/prediction|attempt|event`), but no UI wires them — the capture loop is inert. Per project memory, **smoke-test rows were left in the live DB** (pred `4bf88e7d`, attempt `073d60dc`, owner `ece83f09`). Dead-but-live code plus stray test data in prod is a hygiene/compliance smell. **Fix:** delete the smoke rows; gate the routes behind a feature flag until wired. **Effort: ~1 h + DB cleanup.** (Could not verify the rows directly — Supabase MCP requires interactive auth this session.)

---

## Scalability to 100k+ — verdict

The corridor design bounds the hard part: the catalogue is **curated (~64 programs)**, so matching cost is bounded regardless of user count. The real limits are: (1) **catalogue re-reads per request with no cache** (P2 above) — the fix is straightforward and high-leverage; (2) **re-score fan-out** on every profile edit with no per-user rate limit; (3) **fail-open rate limiting** removing the only backpressure if Upstash drops. Postgres schema is clean — every FK indexed (`harden_advisors` migration), partial-unique indexes on primary assessment and open plan items, RLS forced on every table. No unindexed hot query was found. With catalogue caching + per-user limits, this architecture reaches 100k users comfortably.

## What's genuinely good (risk-relevant)
- **Scoring is truly server-side.** The engine, cutoffs, and weights do not reach client JS (only FX/gap helpers do). The "no scoring rules in client" rule holds where it matters.
- **Service-role writes are fenced.** Admin client always scopes by `.eq("owner", userId)` from session, never body; `claimAssessment` guards `owner IS NULL AND unexpired`; `getRecoverableAssessment` re-verifies the predicate post-fetch as defense in depth.
- **Honest degradation is pervasive** (catalogue hiccup → empty matches, not a 500; guide 503 → calm copy; PostgREST value-errors surfaced, not swallowed into 200s).
- **~297 real test files** with role/aria-driven assertions. The gap is no automated a11y (axe) and **no coverage instrumentation** — the "~1900 green" figure has no line/branch backing, so untested branches are invisible.

## Missing env docs (deploy risk)
`.env.example` omits three code-referenced vars: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `NEXT_PUBLIC_SITE_URL`. A fresh deploy silently omitting `NEXT_PUBLIC_SITE_URL` makes `resolveSiteOrigin` fall back to host headers for the post-auth redirect target (host-header influence on OAuth redirect); omitting `DEEPSEEK_API_KEY` 503s the guide. **Fix:** document all three. **Effort: ~15 min.**
