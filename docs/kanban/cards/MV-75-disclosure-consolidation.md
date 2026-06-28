# MV-75 — Fold profile accordion onto the shared disclosure primitive

**Source:** design-division polish audit #21 (`docs/audits/2026-06-25-design-division-polish-audit.md`).
**Phase:** B (consolidation). **Priority:** P2. **Risk:** low (presentational + a11y).

## Problem

Two collapsible "accordion" shells had drifted:

- `components/ui/disclosure.tsx` (`Disclosure`) — the shared primitive. Has a rotating
  chevron, `aria-controls`/`aria-expanded` panel wiring, `ease-calm` hover/transition.
- `components/profile/section-accordion.tsx` (`SectionAccordion`) — the profile-group row.
  Carries a domain **status pill** (complete / partial / not started), but had **no chevron**
  affordance and **no `aria-controls`** panel wiring, and used its own padding/motion.

The profile rows therefore read as less obviously expandable and were weaker for screen
readers than the rest of the app's disclosures.

## Change

Fold `SectionAccordion` onto `Disclosure` instead of maintaining a second shell:

1. `Disclosure` gains an optional `trailing?: ReactNode` slot, rendered inside the trigger
   beside the chevron — a home for adornments the primitive itself shouldn't know about.
   Existing consumers (results "Know before you go") pass no `trailing`, so they are
   unchanged.
2. `SectionAccordion` becomes a thin domain wrapper: same public API
   (`title`, `summary`, `status`, `children`), but it now renders `<Disclosure>` with the
   status pill as `trailing`. It inherits the chevron, the `aria-controls` panel wiring, and
   the calm-authority motion for free. The status-pill labels/colours are unchanged.

No scoring, data, verdict, or copy is touched — purely the shell.

## Acceptance criteria

- [x] `Disclosure` renders an optional `trailing` adornment inside the trigger, beside the chevron.
- [x] `SectionAccordion` shows the chevron affordance (folded onto the primitive).
- [x] `SectionAccordion` wires `aria-controls` → a real panel id for screen readers.
- [x] `SectionAccordion` keeps its title, summary (with "Not added yet" fallback), and status pill.
- [x] Profile page + results "Know before you go" disclosure behave unchanged.

## Test plan / evidence (TDD)

- `tests/components/disclosure.test.tsx` — +1: `trailing` adornment renders in the trigger.
- `tests/components/profile/section-accordion.test.tsx` — +2: chevron affordance present;
  `aria-controls` resolves to a real panel element.
- Existing `disclosure` / `section-accordion` / `profile-page` / `results` tests stay green
  (profile-page test mocks `SectionAccordion`, so its public API is the only contract).
- Gate: typecheck clean, lint clean on changed files, full suite green (1560, 248 files).

## Notes

- Profile rows are auth-gated, so visual spacing was a reasoned (not preview-verified) call;
  the consolidation deliberately adopts `Disclosure`'s canonical padding/typography.
- Out of scope: dashboard/results disclosures already use the primitive; no other accordions exist.
