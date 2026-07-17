# Technical Audit — LandingPad (MeroVisa)

_Auditor: staff engineer · 2026-07-10 · repo HEAD `d7347e3`_

Scope: incomplete features, tech debt, architecture, security (RLS / service-role / injection / rate-limit / secrets), scalability to 100k+, missing validation/error handling, DB/API/state issues. Every claim below was grep/read-verified against the tree, not the ground-truth brief.

## Headline

The codebase is unusually disciplined for an MVP: ~297 test files, strong provenance machinery, RLS on exposed tables, and service-role writes generally owner-fenced. The scoring engine is genuinely server-side and the anonymous-recovery predicate is correctly gated. The real risks are nevertheless product-critical: multiple high-stakes correctness defects, repository errors that become false empty states, destructive document replacement, no production error monitoring, repeated request-time catalogue/profile reads, and operational gaps such as no CSP and non-gating database integration tests.

---

## Findings

### P1 — profile-strength credits raw non-IELTS scores as if they were IELTS bands
`lib/scoring/profile-strength.ts:15-18` and `:46-56` compare `profile.englishScore >= 7.5 / >= 7.0` as a **raw** score. But `englishScore` is "the score in the chosen test's scale" (`lib/scoring/types.ts:36`) and validation allows `0–120` (`lib/validation/profile.ts:33`) to cover TOEFL (0–120) and PTE (0–90). `visa.ts:54` correctly normalizes via `toIeltsEquivalent(score, test)`; profile-strength does **not**. Consequences:

- **Every PTE/TOEFL taker gets the maximum `+8` "strong English" bonus regardless of proficiency.** A PTE 50 (≈ IELTS 4.5, *below* the DHA visa floor) satisfies `50 >= 7.5` → `+8` to profile-strength.
- The results UI then renders the factor label **`Strong English (50.0)`** (`profile-strength.ts:52`, `${profile.englishScore.toFixed(1)}`) — a visibly nonsensical, trust-breaking string in a product whose entire pitch is calibrated honesty. A TOEFL taker sees `Strong English (100.0)`.
- Anonymous-vs-signed-in divergence compounds it: the same person can get different profile-strength depending on which test they entered.

This is not the "known asymmetry" hand-waved in the brief — it is a wrong-direction bug plus broken copy. **Fix:** route through `toIeltsEquivalent` exactly as `visa.ts` does; add a regression test with a PTE/TOEFL profile asserting the bonus and label track the IELTS-equivalent, not the raw number. **Effort: ~1–2 h.**

### P0 — match readiness can be confidently wrong for budget and missing data
`components/wizard/steps/budget-step.tsx:80-84` defines the student's annual budget as tuition **plus living costs**. `lib/matches/compute.ts:73-86,139-149` then compares the entire converted amount only against `tuitionMin` and emits “Budget covers … tuition.” Separately, missing grade, English, and budget default to `0`, while `/matches` blocks only when `sections` is completely empty. A profile containing only identity data therefore generates confident negative gaps, and an all-in A$50k budget can be shown as covering A$40k tuition without accounting for the living-cost requirement. **Fix:** require the minimum scoring inputs, represent unknowns explicitly, and model tuition capacity separately from living/dependant/total first-year capacity. **Effort: 2–5 days including migration/adapters/tests.**

### P0 — an unsupported six-month bank-history rule is rendered as expected policy
`lib/matches/compute.ts:153-157`, `lib/plan/generator.ts:196-203`, and `lib/checklist/generator.ts:244` expose a six-month “bank seasoning” expectation/recommendation for Nepal AL3. The repo's own research (`docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md`) says DHA publishes no fixed duration and practitioner claims conflict. This is exactly the kind of consultancy folklore the product claims to replace with sourced guidance. **Fix:** remove the fixed duration from match reasons; if LandingPad retains a conservative product recommendation, label it as such, show the evidence basis/confidence, and never attribute it to DHA. **Effort: <1 day.**

### P0 — authenticated users can forge the outcome data intended for calibration
The migration grants owner-scoped INSERT policies on `program_predictions`, `application_attempts`, and `outcome_events` (`supabase/migrations/20260620000000_add_outcome_validation.sql:137-193`). RLS prevents cross-user writes, but it does **not** prove that verdict/score/rule version were server-derived, that an attempt's program matches its prediction, that gate/authority are correct, or that event transitions follow the state machine. Those checks live only in route code and can be bypassed with Supabase's exposed Data API. **Do not calibrate, publish outcome claims, or sell analytics from these rows.** Revoke direct authenticated INSERT, expose one transactional server/RPC operation, and enforce consistency/transitions/idempotency in the database.

### P0 — three-day anonymous expiry does not delete the stored assessment
Anonymous assessments store profile/result JSON plus `expires_at`; repository code checks expiry on claim/read but no scheduled purge or deletion endpoint exists. The row therefore becomes inaccessible through normal UI after three days while the sensitive academic/financial payload remains indefinitely, and an anonymous student has no account deletion control. Add a daily purge job, retry/dead-letter/metrics, a documented retention rule, and an anonymous bearer deletion capability issued at creation.

### P1 — profile completeness and English entry states are broken
`lib/results/accuracy.ts:15-29` starts completeness at 25 and can add only 3, while labels require 40 (“Verified”) and 75 (“Complete”); document suggestions never affect the number. `components/profile/editors/english-editor.tsx:24-29,69-85` correctly changes the overall maximum for IELTS/PTE/TOEFL but caps all four component scores at IELTS 9. These defects make the profile surface both impossible to complete and unusable for real PTE/TOEFL subscores. **Fix:** rename/rebuild completeness from explicit fields and use test-specific component scales. **Effort: <1 day.**

### P1 — replacing a document can destroy the previous valid file
`app/api/documents/upload/route.ts:65-91` removes the existing storage object and database row before reading the new bytes, checking magic bytes, or uploading. An invalid replacement or storage outage therefore loses the previous document. Upload the new object first, validate it, switch metadata in a transaction/idempotent operation, then remove the old object asynchronously. Add failure-path tests that prove the old document remains. **Effort: ~1 day.**

### P1 — database outages frequently masquerade as empty user state
Several repositories discard Supabase errors and return `[]`/`null` (`lib/programs/repo.ts`, `lib/matches/repo.ts`, `lib/documents/repo.ts`, `lib/documents/status-repo.ts`, `lib/outcomes/repo.ts`). The route/page then renders “no programs,” “no documents,” or no applications instead of an error boundary. This is not graceful degradation in a high-trust workflow; it is false state. Introduce typed repository errors, distinguish “not found” from query failure, and log/trace once at a server boundary. **Effort: 2–5 days across repositories and UI states.**

### P1 — critical state transitions are non-transactional and profile writes race
`lib/assessments/claim.ts:26-84` claims the row, then bootstraps profile, switches primary assessment, and creates a lead in separate calls. Failure after claim can make a retry impossible. `Applied` status, prediction freeze, attempt creation, and root event are also separate best-effort writes (`app/api/shortlist/route.ts`, `lib/outcomes/on-apply.ts`). Separately, `patchProfileSection` reads the full JSON blob, merges in memory, and overwrites without a revision predicate, so multi-tab/device edits and upload-triggered flags can lose one another. Move each domain transition into a transaction/RPC with idempotency; add a `revision` compare-and-swap or row-locked JSONB patch.

### P1 — historical outcome integrity is coupled to mutable/deletable catalogue rows
Programs are mutable current rows with one tuition/source/date and month-name intakes. Outcome predictions/attempts ultimately reference those rows, and deletion cascades can erase historical calibration context. Introduce immutable `program_versions`/offering snapshots, reference them from predictions/attempts, and use soft deletion or RESTRICT for history. A recommendation must retain rule version, data-bundle version, normalized inputs, and course version.

### P1 — proxy/auth work is duplicated and the intended-path header is wired in the wrong direction
`proxy.ts` matches APIs and most pages and calls remote `auth.getUser`; many routes/layouts repeat it. Middleware sets `x-pathname` on the response while the app layout reads it as a request header, so unauthenticated deep-link recovery can fall back to `/dashboard`. Narrow proxy work, forward a cloned request header if needed, and centralize authorization in a server-only DAL. Cache/dedupe request-scoped auth and profile reads.

### P1 — No production error monitoring wired
`CLAUDE.md` and `.env.example` list Sentry, but `grep -c sentry package.json` → **0**; no `@sentry/*` dependency, no `instrumentation.ts`, no import anywhere. For a live product on Vercel auto-deploy from `master`, this means **server exceptions in API routes surface only as `console.error` into Vercel function logs** — no alerting, no aggregation, no release tagging. The many `console.error(...)` swallow-and-continue sites (`/api/assess`, `claim.ts`, rate-limit fail-open) are invisible unless someone reads raw logs. BetterStack is also not in code (external dashboard only). **This is the single biggest operational gap:** a scoring or persistence regression can ship to production and degrade silently. **Fix:** add `@sentry/nextjs`, wire `instrumentation.ts` + client config, tag by `RULE_VERSION`. **Effort: ~half day.**

### P2 — Request-time catalogue re-reads: 2–3 full-table scans per assessment, no caching
`POST /api/assess` (`app/api/assess/route.ts`) fetches the entire program + university catalogue via `listAllPrograms`/`listAllUniversities` — each a `.from("programs").select("*").order("name")` with **no limit/pagination** (`lib/programs/repo.ts:8-11`). For a signed-in user it then calls `reScoreAssessment` (line 115), which **fetches the full catalogue AGAIN** (`lib/assessments/re-score.ts:20-25`) and re-runs `assembleAssessment` (matching) a second time. So a single signed-in assess request does: catalogue fetch #1 (line 58-62), `assembleAssessment` #1 (line 67), then re-score's catalogue fetch #2 + `assembleAssessment` #2 — plus it instantiates **two admin clients** per request (line 58 `catalogDb`, line 74 `adminDb`). At today's 83 programs this is cheap, but:

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

### P2 — Outcome capture is live, but unverified data and test-row hygiene need governance
The MV-08 migration and `lib/outcomes/**` are wired: selecting `Applied` calls `captureApplication`, freezes a prediction, opens an attempt, and records the root event; dashboard/API paths accept later self-reported events. The missing half is an admin/evidence verification path and consented calibration. The Kanban also names smoke-test production row identifiers; this audit could not query production to confirm whether they remain. **Fix:** verify and remove any test rows, tag test data explicitly in future, and prevent self-reported events from entering calibration until verification rules are implemented.

### P2 — CI has breadth but lacks a gating real-database and browser story
The fast CI path runs typecheck, lint, unit/jsdom tests, and build. The local-Supabase integration job is `continue-on-error`, so schema/RLS regressions do not block merge. There is no Playwright/Cypress end-to-end suite for the anonymous wizard→claim→dashboard→apply/outcome path, and no automated axe pass. Promote a minimal disposable-Supabase integration suite to a required check and add 3–5 browser journeys before public launch. **Effort: 3–7 days.**

### P2 — public routes are needlessly dynamic and the build hides framework control-flow errors
Marketing layout auth personalization calls cookies/auth and catches Next's own static-bailout exception (`app/(marketing)/layout.tsx:14-20`). Production build logs repeated swallowed `DYNAMIC_SERVER_USAGE` errors and classifies all user routes dynamic. Marketing home/layout also duplicate auth lookups. Keep the public shell static, move account personalization to a small client or dynamic island, and rethrow framework control-flow errors. The build also depends on live Google Fonts; vendor the approved font files for reproducible CI/deploys.

---

## Scalability to 100k+ — verdict

The corridor design bounds the matching set at **83 programs** today. The main limits are: repeated catalogue/profile reads; re-score fan-out on profile edits; fail-open rate limiting; owner-global state that cannot isolate multiple journeys; and no async job/event model for notifications, ingestion, or recomputation. Postgres fundamentals are comparatively strong — FKs are indexed, key uniqueness constraints exist, and RLS is forced. With request caching/deduplication, per-user limits, journey scoping, background jobs, required DB integration tests, and observability, the architecture can support 100k users without a premature microservice rewrite.

## What's genuinely good (risk-relevant)
- **Scoring is truly server-side.** The engine, cutoffs, and weights do not reach client JS (only FX/gap helpers do). The "no scoring rules in client" rule holds where it matters.
- **Service-role writes are fenced.** Admin client always scopes by `.eq("owner", userId)` from session, never body; `claimAssessment` guards `owner IS NULL AND unexpired`; `getRecoverableAssessment` re-verifies the predicate post-fetch as defense in depth.
- **Some honest degradation is good** (Guide 503 → calm, explicit copy), but repository query failures must stop masquerading as empty results.
- **~297 real test files** with role/aria-driven assertions. The gap is no automated a11y (axe) and **no coverage instrumentation** — the "~1900 green" figure has no line/branch backing, so untested branches are invisible.

## Missing env docs (deploy risk)
`.env.example` omits three code-referenced vars: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `NEXT_PUBLIC_SITE_URL`. A fresh deploy silently omitting `NEXT_PUBLIC_SITE_URL` makes `resolveSiteOrigin` fall back to host headers for the post-auth redirect target (host-header influence on OAuth redirect); omitting `DEEPSEEK_API_KEY` 503s the guide. **Fix:** document all three. **Effort: ~15 min.**

## Verification results (2026-07-10)

- `npm run typecheck`: **PASS** (5.074s).
- `npm run lint`: **PASS**, 0 errors / 1 warning (`docs/kanban/build.mjs:77`, unused `done`) (14.681s).
- `npm test`: **PASS**, 297 files / 1,911 tests (455.24s). The run emitted a real React warning: `ProfileRecap` triggers an `AssessFlow` update during render via an unstable inline callback (`components/assess/assess-flow.tsx:193`; timer effect `profile-recap.tsx:71-74`).
- `npm run build`: first sandboxed run failed only because `next/font` could not fetch Google; network-enabled rerun **PASS** (12.081s), with the dynamic-route warnings above.
- Browser: home, trust, destinations, full anonymous wizard/results, desktop and 390px mobile were checked. No framework overlay or captured console errors on the home page. Authenticated browser coverage was blocked because the dev sign-in route did not establish a session; authenticated screens are code/test audited, not claimed as live-smoked.
