# MV-181 — Case-frame refit: persistent context, decision-strip slot, manage-inside-frame

**Priority:** P1 · **Owner:** agent · **Created:** 2026-08-17

## Why

Slice ③ of the workspace UI lane. MV-172 (PR #143) already built the case routes and `components/workspace/case-workspace-shell.tsx` — this card is the DELTA between what exists and the spec's persistent-context contract, NOT a from-scratch build (preamble amendment 1). Verify against the merged #143 tree before scoping work; re-building what exists is the MISTAKES.md top process error.

**Spec:** `docs/superpowers/specs/2026-08-17-consultancy-workspace-ui.md` §1 (persistent case context, return behavior) + §3 (case detail zones) + §4 inventory.

## Scope (as a delta)

- Align the existing case shell with the spec's frame: back-to-day-view link, display name, email/none, linkage marker, status pill, `StaffReference` assignee, case-section nav (sticky rail desktop / scrollable row mobile).
- Case overview composes: decision-strip slot (renders NOTHING until judgement/Stage 4 ship — no placeholder), single next-action panel (same resolution helper as MV-179), operational rail.
- Unlinked-case overview leads with the invite-the-student block (text only until Stage 5 — no dead controls); linked case drops it entirely.
- Refit `/manage` as "Case details" inside the persistent frame — keep URL, mutation logic, and error semantics.
- Queue rows and new-case success navigate to the case overview.
- Every nested page re-authorizes independently (reassignment mid-session must bite at the next boundary).

## Acceptance criteria

1. Case header + section nav persist across every case subroute; active section is marked; back link always targets the Day view.
2. Zero dead links: Documents/Visa read/Activity nav entries absent until their routes ship.
3. Unlinked vs linked states render per spec §3 (abstention-style empties, never zero scores, no raw `student_user_id`).
4. Manage keeps its explicit reassignment-conflict and left-unassigned errors inside the new frame.
5. Gate green + browser pass: queue → case → section → back.

## Test plan

Per spec §7 PR 3, adjusted for the refit: route tests owner/admin all-case + counsellor assigned-case; cross-org/unassigned/missing/lookup-failed stay distinguishable; persistent-header and active-link tests; #143's existing case-route test suite stays green.
