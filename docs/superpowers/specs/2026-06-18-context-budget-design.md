# Context Budget — Design Spec

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming), pending implementation plan
- **Scope:** Project-local only (`merovisa` repo). Not a global/user-level tool.

## Problem

Result quality degrades as the context window fills ("context rot" / "dumb
zone"). The model is at its *least* capable exactly when autocompact fires,
because autocompaction runs at maximum context occupancy. A **hinted, manual**
`/compact` issued earlier — e.g. `/compact focus on the auth refactor, drop the
test debugging` — preserves the live thread and discards resolved tangents,
beating a blind autocompact.

We want the session to **proactively suggest a focused `/compact`** once context
crosses a threshold, so autocompact never has to fire.

## Goals

- Deterministically detect context occupancy each turn and nudge when over a
  threshold (a passive skill cannot do this — it never auto-fires).
- Express the threshold where context rot actually bites, **not** as a fraction
  of this session's 1M window (literal 30% of 1M = 300k tokens — far too late).
- When nudging, recommend a `/compact` with a *tailored focus hint*, and capture
  the reusable craft of writing such hints.
- Be quiet and fail-safe: never block a prompt, never bloat context with verbose
  warnings, never nag every single turn.

## Non-goals

- Running `/compact` automatically. Slash commands are the user's to type; the
  feature only *suggests*.
- Detecting "simple vs complex task" in code. That judgment stays with the model,
  guided by the policy text.
- Any global / cross-project behavior.

## Threshold model

Measured against a fixed **effective budget of 200,000 tokens** (configurable),
independent of the real context window.

| Tier | Tokens | % of budget | Behavior |
|------|--------|-------------|----------|
| Safe | < 60k  | < 30%       | Silent. |
| Soft | 60k–120k | 30–60%    | Nudge: if the current task is simple or nearly done, fine to continue; otherwise recommend `/compact <hint>`. |
| Hard | ≥ 120k | ≥ 60%       | Nudge: recommend `/compact <hint>` now, regardless of task. |

Tunables (constants at the top of the hook script): `EFFECTIVE_BUDGET` (200000),
`SOFT_FRACTION` (0.30), `HARD_FRACTION` (0.60).

## Component 1 — the hook (trigger)

### Registration
`.claude/settings.json` (new, committed) registers a **`UserPromptSubmit`** hook:

```
node "$CLAUDE_PROJECT_DIR/.claude/hooks/context-budget.mjs"
```

`settings.local.json` is left untouched (it holds local permissions only).

### Script: `.claude/hooks/context-budget.mjs`

On each user prompt submit:

1. Read the hook payload from **stdin** (JSON); take `transcript_path`.
2. Read the transcript JSONL; scan **from the end** for the most recent assistant
   entry carrying a `message.usage` block.
3. Compute current occupancy:
   `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
4. Resolve the tier (Safe / Soft / Hard).
5. **Debounce** via gitignored `.claude/.context-budget-state.json` (stores the
   last-notified tier):
   - Emit when the tier **escalates** above the last notified tier.
   - Additionally **re-emit every turn while in Hard** (urgent).
   - Do not repeat the Soft nudge turn-after-turn.
   - When occupancy falls back to Safe (e.g. after a `/compact`), reset state.
6. On emit, print JSON to stdout:
   ```json
   { "hookSpecificOutput": {
       "hookEventName": "UserPromptSubmit",
       "additionalContext": "<terse reminder>" } }
   ```
   The reminder is ~2 lines: current %/tokens, the tier-appropriate
   recommendation, and a pointer to the `context-budget` skill for hint-craft.

### Fail-safe rules

- **Always exit 0.** Never exit 2 (which would block the prompt).
- Any error — missing/unreadable transcript, no `usage` found, malformed JSON,
  unwritable state file — results in a silent no-op (exit 0, no stdout).
- No network, no heavy work; reads only the transcript tail and a tiny state file.

## Component 2 — the skill (policy + hint craft)

`.claude/skills/context-budget/SKILL.md` (project-scoped). Canonical reference,
also the target the hook reminder points at. Contents:

- The threshold model and its rationale (context rot, the autocompact trap).
- The **simple-vs-complex** judgment rule for the Soft tier (continue vs compact).
- **How to write a focused `/compact` hint** — the reusable core:
  - *Keep* what is live: the current goal, key decisions made, working file state.
  - *Drop* what is resolved: closed tangents, finished debugging, verbose tool
    output already acted upon, dead-end exploration.
  - Template + worked example: `/compact focus on the auth refactor, drop the
    test debugging`.
- **When not to compact:** mid-edit, or immediately before a verification step
  that needs the full current context.
- The principle: a hinted manual `/compact` > autocompact, every time.

## File manifest

| Path | Status | Purpose |
|------|--------|---------|
| `.claude/settings.json` | new (committed) | Registers the `UserPromptSubmit` hook. |
| `.claude/hooks/context-budget.mjs` | new | Threshold detection + nudge emission. |
| `.claude/hooks/context-budget.test.mjs` | new | Node test for tiers + debounce. |
| `.claude/skills/context-budget/SKILL.md` | new | Policy + hint-writing guidance. |
| `.gitignore` | edit | Ignore `.claude/.context-budget-state.json`. |

## Testing

`.claude/hooks/context-budget.test.mjs`, run with `node`:

- Synthesize transcripts whose last assistant `usage` sums to 40k / 80k / 130k
  tokens; assert Safe (no output) / Soft / Hard respectively.
- Assert the reminder JSON shape (`hookSpecificOutput.additionalContext` present).
- Assert debounce: a second Soft-tier invocation with unchanged tier emits
  nothing; a Soft→Hard escalation emits; Hard re-emits on repeat.
- Assert fail-safe: missing transcript path / unparseable file → exit 0, no
  stdout.

## Configuration

All tunables are top-of-file constants in `context-budget.mjs`
(`EFFECTIVE_BUDGET`, `SOFT_FRACTION`, `HARD_FRACTION`). No env vars, no config
file.

## Resolved decisions

- **Mechanism:** hook (trigger) + skill (policy). A skill alone cannot auto-fire.
- **Threshold basis:** calibrated % against a 200k effective budget, not the real
  1M window.
- **Nag control:** escalation-based debounce, with Hard re-emitting each turn.
- **CLAUDE.md:** no edit by default (optional one-liner pointer if desired later).
