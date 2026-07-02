# MV-78 — AI guide go-live trust hardening (Codex review)

**Source:** Codex (gpt-5.5, xhigh) pre-go-live trust review, 2026-06-29, after the valid
`DEEPSEEK_API_KEY` was set in Vercel and the guide went live (MV-63 / PR #10, Phase 6).
**Surfaces:** `app/api/guide/chat/route.ts`, `lib/guide/deepseek.ts`, `lib/guide/context.ts`,
`lib/guide/system-prompt.ts`.

## What's already sound (do NOT re-do)

The system prompt + context builder are well-built for trust: scoring internals (dimension
values, weighted total, per-match score gaps) are explicitly omitted (`context.ts:14-16`);
banded verdict words enforced; no-draft + source-citation rules pinned by tests; auth
required before any provider call (`route.ts:41-43`); key stays server-only (`deepseek.ts:1`).

## SHIPPED this slice

- **[#3] Provider timeout** (`lib/guide/deepseek.ts`) — every call is now bounded by
  `AbortSignal.timeout(20s)` when the caller gives no signal, so a hung DeepSeek request
  aborts → the route's calm 503 fires, instead of hanging until the platform kills the
  function. TDD +1 (`tests/guide/deepseek.test.ts`: a timeout AbortSignal is always passed).
  The clear must-fix: it's the one finding that broke a live trust promise ("fail honestly,
  fast").

## Remaining Codex findings — founder to prioritize (NOT auto-built; some are over-engineering)

| # | Finding (file:line) | My triage | Note |
|---|---|---|---|
| 1 | Client-supplied `assistant` history is trusted (`route.ts:56-60`) | **Worth doing** | Prompt-injection vector — a client can put words in the "assistant" mouth. Mitigated by the strong system grounding, but worth neutralizing (treat history as untrusted user text, or reconstruct server-side). Needs care + tests. |
| 4 | Key sent to arbitrary `DEEPSEEK_BASE_URL` (`deepseek.ts`) | **Low** | Config-trust (env is founder-controlled, not user input). Defense-in-depth: HTTPS/host allowlist. |
| 7 | Per-line `CostLine.note` dropped from context (`context.ts:74`) | **Low–med** | Could overstate a cost if a line note like "sometimes waived" exists. Include per-line notes if present. |
| 2 | No hard output-policy gate on the model reply (`route.ts:74`) | **Skip for v1** | The system prompt is the right v1 gate (banded-only, no fabrication, no draft). A regex/LLM post-filter is speculative and false-positive-prone — YAGNI unless a real leak is observed. |
| 5 | Factor/match reasons may carry numbers (`context.ts:57-61`) | **Low / near-FP** | These are the same banded prose the user already sees on results; scoring internals are omitted. Only act if a raw % is actually observed in a reason string. |
| 6 | Only first match reason included (`context.ts:57`) | **Low / by design** | Reasonable summarization; not a trust hole. |
| 8 | System prompt "point to the official source" when info absent (`system-prompt.ts:15`) | **Low / near-FP** | It's a generic "check official sources" deferral, not fabricated-source induction. Optional one-line tightening: "don't name a source you weren't given." |

## Acceptance criteria (this slice)

- [x] A provider hang aborts within a bounded timeout and surfaces as the route's calm 503.
- [x] TDD: `deepseekChat` always passes an `AbortSignal` to `fetch` even with no caller signal.
- [x] typecheck + lint clean; no behavior change to the success path.

## Out of scope

Findings #1–#8 above other than #3 — left for the founder to prioritize as follow-up slices
(or to decline). Per simplicity/YAGNI, this slice fixes only the material, clean gap.
