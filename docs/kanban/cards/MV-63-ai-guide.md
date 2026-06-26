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
             ├─ lib/guide/context.ts        ← assembles grounding context (assessment + sourced facts)
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
- **Slice 2 — route + grounding (NEXT):**
  - `lib/guide/context.ts` — build a compact grounding block from the user's primary assessment
    (verdict band, factor reasons, top matches, plan steps, cost-to-apply, evidence levels) + the
    relevant sourced corridor facts, each WITH its source string. No raw scores/rules leaked.
  - `app/api/guide/chat/route.ts` — POST, Zod (message + short history), `getUser()` 401-gate, Upstash
    `checkRateLimit("guide", ip|userId, …)`, assemble `[system, context, …history, user]`, call
    `deepseekChat`, return `{ reply }`; 503 with a calm message if the provider/key fails (reuse the
    MV-62 honesty pattern — never a fabricated fallback answer).
  - Tests: mock deepseek + supabase; assert 401 unauth, 429 rate-limited, refusal/grounding wiring,
    503-on-provider-failure.
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
- [ ] Route is auth-gated + rate-limited + Zod-validated; grounds on the user's own data; cites sources.
- [ ] Refuses to write applications/SOPs and out-of-corridor questions.
- [ ] Chat UI replaces the stub; failures are visible (no silent/fabricated fallback).
- [ ] Gate green; banded verdicts only; no raw % to users.

## Gate (slice 1)

- `npm run typecheck` clean · `npm run lint` 0 errors · full suite **1420** (was 1411) · goldens N/A.

## Resume notes (cold agent)

- Build on branch `mv-63-ai-guide`. Slice 1 is committed. Do slice 2 then slice 3, TDD, then ONE PR.
- The key is in `.env.local` (gitignored) — never echo it, never commit it, never put it in a test.
- Production won't work until the founder adds `DEEPSEEK_API_KEY` to Vercel — flag it on the PR.
