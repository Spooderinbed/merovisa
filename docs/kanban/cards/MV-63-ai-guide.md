# MV-63 — AI guide (Phase 6): grounded, source-citing chat that explains (never decides)

**Column:** In Progress · **Priority:** P1 (founder-directed) · **Owner:** agent
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
app/(app)/guide/page.tsx  (server: load user's primary assessment) 
   └─ components/guide/guide-chat.tsx  (client: message list + input → POST /api/guide/chat)
        └─ app/api/guide/chat/route.ts  (auth-gate + Zod + Upstash rate-limit)
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
- **Slice 3 — UI (NEXT):**
  - `components/guide/guide-chat.tsx` — client chat (message list, input, pending state, visible error on
    failure per MV-62), calm-authority styling, no streaming for MVP.
  - `app/(app)/guide/page.tsx` — replace the "coming soon" stub; server-load the assessment, pass a
    short grounding summary + an empty-state nudge if no assessment yet.
  - Tests: renders, sends, shows reply, surfaces error.
  - One PR when slices 2+3 land (slice 1 rides along on the branch).

## Acceptance criteria

- [x] Server-side DeepSeek client; key never client-exposed; fails loudly, never fabricates.
- [x] Guardrail system prompt pinned by tests.
- [x] Route is auth-gated + rate-limited + Zod-validated; grounds on the user's own data; cites sources.
- [x] Refuses to write applications/SOPs and out-of-corridor questions (enforced by `GUIDE_SYSTEM_PROMPT`).
- [ ] Chat UI replaces the stub; failures are visible (no silent/fabricated fallback). ← slice 3
- [x] No raw scores/% in the grounding (banded verdicts only); full gate green (slices 1–2).

## Gate (slices 1–2)

- `npm run typecheck` clean · `npm run lint` 0 errors · full suite **1432** (1411 → 1420 slice 1 → 1432 slice 2) · goldens N/A.

## Resume notes (cold agent)

- Build on branch `mv-63-ai-guide`. Slice 1 is committed. Do slice 2 then slice 3, TDD, then ONE PR.
- The key is in `.env.local` (gitignored) — never echo it, never commit it, never put it in a test.
- Production won't work until the founder adds `DEEPSEEK_API_KEY` to Vercel — flag it on the PR.
