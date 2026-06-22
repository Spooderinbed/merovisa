# MV-27 — Strip vs keep the mirrored visa-prep rows (checklist ↔ plan)

**Column:** Backlog · **Priority:** P4 · **Owner:** founder (product call) · **Size:** S
**Gate:** founder product/UX decision — do NOT build before the founder picks a direction.
**Created:** 2026-06-23
**Spun from:** [[MV-23]] part (2) (accepted 2026-06-23). Full spec lives in the MV-23 dossier.

## Why

The per-program checklist (`lib/checklist/generator.ts`) and the plan generator both emit
the same AU visa-prep steps (NOC, biometrics, police certificate, GS statement,
translations, agent MARN). [[MV-23]] part (1) shipped mental-model copy framing the two
surfaces — the checklist is the per-program **requirement reference**, the plan is the
single **action queue** — and the completion ACTION is already deduped by the existing
plan-links design. So the worst failure mode (double-completing the same step) is already
mitigated; what remains is a presentation choice.

## The decision (founder)

- **STRIP:** remove the mirrored visa-prep rows from `lib/checklist/generator.ts` so they
  live only in the plan. Single-source and cleaner, but the per-program checklist no longer
  shows the full requirement set in one place.
- **KEEP:** retain the plan-links completion-mirror as-is. The steps appear on both surfaces
  (now explained by the MV-23 copy), at the cost of visible duplication.

Not an agent call — it trades off product/UX philosophy. Needs founder direction; once
chosen, the build (if STRIP) is a small TDD slice on the generator plus a goldens check.

## Status

**Backlog — awaiting founder product call.** No code change until the direction is picked.
If the founder decides KEEP, close this card with that note; if STRIP, it becomes an
agent-ownable build slice.
