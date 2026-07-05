# MV-105 — Wizard step 8: multi-select goals (primary + secondary)

**Column:** Backlog (deferred by founder 2026-07-05 — keep the card, do not build yet)
· **Priority:** P3 · **Owner:** agent

## Why

In local testing the founder asked: *"users should be able to choose multiple options like,
I want PR but also want a high-ranked uni?"* — and immediately saw *"the problems that can
come with this."* Step 8 (goal) is **single-select** today. `goal`
(`permanent-residency` / `high-ranked-uni` / …, in `lib/scoring/types.ts` + `GOAL_LABELS`)
drives verdict framing, the plan, and preference-fit — so naive multi-select makes the
**verdict incoherent** when two goals conflict (PR-friendliness and top ranking frequently
pull in different directions).

## Recommended shape (mine — Codex-triangulate before building)

Mirror the **MV-99 Option A** pattern that already shipped for multi-subject:

- Keep **one primary goal** that owns the verdict + plan (stays unambiguous — the verdict
  always answers "…for *this* goal").
- Add optional **secondary goals** that are purely additive: they broaden which programs
  surface and unlock an **honest "goals can pull apart" trade-off callout** when a secondary
  conflicts with the primary (e.g. *"Top-ranked unis aren't always the strongest PR
  pathways — your verdict follows your main goal."*).
- Additive only → no scoring rewrite; scoring keeps reading the primary `goal`.

Rejected: letting every selected goal drive the verdict (incoherent), or scoring against the
"hardest" goal (needlessly pessimistic, hides opportunity).

## Scope / process

- Touches preference-fit + wizard + recap + (optionally) matching, like MV-99 → run the full
  `superpowers:brainstorming → spec → writing-plans → TDD` chain; do **not** shortcut it.
- Data model is additive: `secondaryGoals?: Goal[]` alongside the unchanged primary `goal`;
  validation cap + disjoint-from-primary refine; wizard two-zone step; recap "also aiming for:"
  line; conflict matrix for the trade-off callout.

## Status

**Deferred by the founder on 2026-07-05** — *"keep it as a card in the board, let's not do it
now."* Filed here so the reasoning + recommended shape survive; not started this session.
