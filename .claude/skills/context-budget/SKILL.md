---
name: context-budget
description: Use when context is filling up or when deciding whether and how to /compact — the policy for keeping context below the degradation ("dumb zone") threshold and how to write a focused /compact hint. Project-local to merovisa.
---

# Context Budget

Result quality degrades as the context window fills ("context rot"). The model is
at its **least** capable exactly when autocompact fires, because that happens at
peak occupancy. A **hinted, manual** `/compact` issued earlier preserves the live
thread and drops resolved tangents — always better than a blind autocompact.

A `UserPromptSubmit` hook (`.claude/hooks/context-budget.mjs`) measures occupancy
each turn and injects a reminder when you cross a threshold. This skill is the
policy behind that reminder.

## Thresholds

Measured against a **200k-token effective working budget** (not this session's
real window — a literal fraction of a 1M window would fire far too late).

| Tier | Tokens | % of budget | What to do |
|------|--------|-------------|------------|
| Safe | < 60k  | < 30%       | Nothing. Keep working. |
| Soft | 60k–120k | 30–60%    | If the task is **simple or nearly done**, keep going. Otherwise recommend the user run a focused `/compact`. |
| Hard | ≥ 120k | ≥ 60%       | Recommend a focused `/compact` **now**, regardless of task. |

You cannot run `/compact` yourself — recommend it clearly and hand the user the
exact hint to type.

## How to write a focused /compact hint

A good hint names what to **keep** and what to **drop**:

- **Keep:** the current goal, decisions already made, the working state of files
  you're mid-change on, the acceptance criteria.
- **Drop:** resolved sub-threads, finished debugging, dead-end exploration, and
  verbose tool output you've already acted on.

Template:

    /compact focus on <the live task / what to keep>, drop <the resolved tangents>

Worked example:

    /compact focus on the auth refactor, drop the test debugging

## When NOT to compact

- **Mid-edit** — finish the current file change first; compacting can lose the
  exact state you're working against.
- **Right before a verification** that needs the full current context (e.g. you're
  about to reason over a long diff or test output you just produced).

## The principle

A hinted manual `/compact` > autocompact, every time. Nudge early, compact with
intent, never let autocompaction decide for you at peak context.
