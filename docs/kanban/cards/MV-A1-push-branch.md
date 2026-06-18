# MV-A1 — Push `feat/context-budget` / open PR

**Priority:** P1   **Owner:** founder (approval) → agent (execute)
**Status:** ✅ Done — pushed 2026-06-18 on founder GO.
**Goal:** Get Phase 0 + Phase 1 off the local branch and into the remote / a PR.

## Context links
- Execution checkpoint (what's on the branch): `docs/audits/2026-06-18-EXECUTION-CHECKPOINT.md`
- Remote: `origin https://github.com/Spooderinbed/merovisa.git`

## Acceptance criteria
- [x] Founder says GO.
- [x] `feat/context-budget` pushed to origin (`-u`, upstream set). PR not yet opened — `gh` unauthenticated; founder can open via the GitHub link.
- [ ] CI (if any) green on the remote. _No CI configured in-repo; nothing to gate on._

## Dependencies / blocked-by
- **Founder GO** (held back per the standing rule: nothing outward-facing without explicit approval).
- `gh` is **not authenticated** — opening a PR via CLI needs `gh auth login` first (push via git works once authed/credentialed).

## Risk notes
- Outward-facing / irreversible-ish (public branch). Do not push without explicit GO.

## Agent resume notes (cold start)
- Only act on explicit GO. Then: confirm working tree is clean of unintended changes, push the branch, offer to open a PR (needs `gh auth login`).

## Decision log
- 2026-06-18 — Held for founder GO; 9 slices merged locally, 1075 tests green, not pushed.
- 2026-06-18 — Founder GO received; pushed.

## Done evidence
- `git push -u origin feat/context-budget` → `* [new branch] feat/context-budget -> feat/context-budget`; upstream now tracks `origin/feat/context-budget`.
- PR open link (gh not authed): https://github.com/Spooderinbed/merovisa/pull/new/feat/context-budget
- Pushed up to commit `671ead3` (the 4 doc/kanban/test commits + the prior Phase 0/1 work).
