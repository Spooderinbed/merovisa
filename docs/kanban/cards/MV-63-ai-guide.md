# MV-63 — AI guide (Phase 6): grounded, source-citing chat that explains (never decides)

**Column:** In Review · **Priority:** P1 (founder-directed) · **Owner:** agent
**Branch:** `mv-63-ai-guide` · **Started:** 2026-06-26
**Vision:** `docs/memory/project_vision.md` — *"AI guide that explains reasoning, not decides — rule-based first, AI explains."* The MVP design spec deferred Phase 6 to a separate spec that was never written, so **this card IS the Phase 6 design/build plan.**

## Founder decisions (2026-06-26)

- **Shape:** live grounded chat (not a deterministic explainer) — it's the real consultancy-substitute.
- **Provider:** DeepSeek (cheap, OpenAI-compatible). Key provided + stored in `.env.local` as
  `DEEPSEEK_API_KEY` (+ `DEEPSEEK_BASE_URL`). **Founder TODO:** (1) rotate the key — it was shared in
  plaintext; (2) add `DEEPSEEK_API_KEY` to the **Vercel** env for production (this file is local-only).
  Note: the latest Claude models are the platform default for AI features, but the founder explicitly
  chose DeepSeek for cost — user instruction overrides the default.

## Architecture (trust-first)

Rule-based engine stays authoritative; the guide is an **explanation layer** over the student's own
results + MyVisa's already-sourced corridor data. Server-side only (key never reaches the browser).

```
app/(app)/guide/page.tsx  (server: load user's primary assessment)  ✅ SHIPPED
   └─ components/guide/guide-chat.tsx  (client: message list + input → POST /api/guide/chat)  ✅ SHIPPED
        └─ app/api/guide/chat/route.ts  (auth-gate + Zod + Upstash rate-limit)  ✅ SHIPPED
             ├─ lib/guide/context.ts        ← assembles grounding context (assessment + sourced facts)  ✅ SHIPPED
             ├─ lib/guide/system-prompt.ts  ← GUIDE_SYSTEM_PROMPT (the guardrails)  ✅ SHIPPED
             └─ lib/guide/deepseek.ts       ← server-side DeepSeek client            ✅ SHIPPED
```

## Guardrails (the whole point)

Encoded in `GUIDE_SYSTEM_PROMPT` (pinned by tests): explain-not-decide; ground only in supplied
context; never invent figures/fees/dates/rules; cite MyVisa's source for every corridor fact; never
write the student's application/SOP (genuine-student integrity); Nepal→Australia only; banded verdicts
never a percentage; calm/plain; admit officer-judgement uncertainty. Low temperature (0.2) reinforces
grounded-over-creative.

## Slices

- **Slice 1 — foundation (THIS checkpoint, ✅ DONE):**
  - `.env.local` key (gitignored, append-only — existing secrets untouched).
  - `lib/guide/deepseek.ts` — OpenAI-compatible client (plain fetch, no new dep); throws on missing key /
    non-ok / empty content (never silent, never fabricated). Tested.
  - `lib/guide/system-prompt.ts` — `GUIDE_SYSTEM_PROMPT`. Tested (5 guardrails pinned).
  - Gate green: typecheck/lint, suite 1420 (was 1411).
- **Slice 2 — route + grounding (✅ DONE):**
  - `lib/guide/context.ts` — `buildGuideContext({ payload, planItems })` builds a compact grounding
    block from the user's primary assessment (banded verdict label, factor reasons w/ optional source,
    top 5 matches w/ evidence level + source, open plan items) + the sourced cost-to-apply corridor
    data (every line cites its source). **No raw scores/rules leaked** — dimension `value`, `weighted`,
    and per-match `scoreSnapshot` gaps are omitted by construction, pinned by a no-leak test. Null
    payload → an honest "has not completed an assessment yet" block (no fabricated verdict).
  - `app/api/guide/chat/route.ts` — POST, Zod (`message` 1–2000 chars + optional `history` ≤12 turns),
    `getUser()` 401-gate, `checkRateLimit("guide", userId, 20, "1 m")` → 429, loads primary assessment
    + open plan, assembles `[system(GUIDE_SYSTEM_PROMPT), system(context), …history, user]`, calls
    `deepseekChat`, returns `{ reply }`. **503 with a calm message on provider failure — never a
    fabricated fallback.** Note: `primaryRow.result` IS the stored `AssessmentPayload` (which itself
    nests `.result`) — mirror that exact shape in any mock.
  - Tests (12): context = banded-verdict/no-leak, factor sources, matches+evidence, plan, sourced cost,
    null-payload-no-fabrication; route = 401, 422, 429, 200+system-first/user-last wiring, grounding on
    the student's own data, 503-on-provider-failure (no `reply`).
- **Slice 3 — UI (✅ DONE):**
  - `components/guide/guide-chat.tsx` — client chat (message list, textarea + Ask, pending "thinking…",
    visible `role="alert"` error on failure per MV-62 — never a fabricated reply). Sends `{ message,
    history(last 12) }` to `/api/guide/chat`, appends the reply on success. Calm-authority styling
    (teal/paper, thin borders, pill button), no streaming for MVP.
  - `app/(app)/guide/page.tsx` — replaced the "coming soon" stub; server component, `getUser()` →
    `redirect("/auth?next=/guide")`, loads the primary assessment to drive an empty-state nudge
    ("Run your assessment") while still offering the chat for general corridor questions.
  - Tests (6): chat renders/sends+reply/visible-error/no-empty-post; page replaces-stub + assessment-nudge.
  - Obsolete `tests/app/app-stubs.test.tsx` (asserted the stub) deleted — superseded by guide-page test.
  - **One PR for slices 1–3 (this branch). Merge to master is founder-gated.**

## Acceptance criteria

- [x] Server-side DeepSeek client; key never client-exposed; fails loudly, never fabricates.
- [x] Guardrail system prompt pinned by tests.
- [x] Route is auth-gated + rate-limited + Zod-validated; grounds on the user's own data; cites sources.
- [x] Refuses to write applications/SOPs and out-of-corridor questions (enforced by `GUIDE_SYSTEM_PROMPT`).
- [x] Chat UI replaces the stub; failures are visible (no silent/fabricated fallback).
- [x] No raw scores/% in the grounding (banded verdicts only); full gate green (slices 1–3).

## Gate (slices 1–3)

- `npm run typecheck` clean · `npm run lint` 0 errors · full suite **1437** (1411 → 1420 s1 → 1432 s2 → 1437 s3, net of the deleted obsolete stub test) · goldens N/A.

## Resume notes (cold agent)

- All three slices are committed on branch `mv-63-ai-guide`. Feature build is COMPLETE; the card is in
  review awaiting the founder-gated `gh pr merge`.
- The key is in `.env.local` (gitignored) — never echo it, never commit it, never put it in a test.
- **Production won't work until the founder (1) rotates the key [shared in plaintext] and (2) adds
  `DEEPSEEK_API_KEY` to Vercel.** Until (2), the route returns its calm 503 in prod — flagged on the PR.
