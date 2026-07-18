# MV-134 — Destinations page markets corridors the product doesn't support (audit C-11)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_ (live marketing copy)
**Source:** 2026-07-10 audit finding **C-11** + the §6-Today "stop the live false claims"
P0, confirmed uncarded 2026-07-17. Sibling of MV-122 (trust page) — SAME class of bug,
DIFFERENT surface. MV-122/slice 7 touches `trust/page.tsx` only.

## Why (student outcome)

`app/(marketing)/destinations/page.tsx` presents "six countries, done well" (and related
claims) while the product only actually supports Nepal→Australia. A Nepali student
researching, say, Canada is told the product handles it, invests trust, and hits a
dead-end — the exact consultancy-bounce the app exists to prevent, caused by our own copy.

This is a LIVE false claim in production, which is why it is a P0 and not backlog.

## The bug

- `app/(marketing)/destinations/page.tsx` — the "six countries, done well" framing markets
  unsupported corridors.
- Grep the same file + `destinations/[id]/page.tsx` for adjacent overclaims the audit
  flagged (e.g. a "485 = 2–4 years" duration, "all figures current"). Fix them together —
  the point is that the destinations surface stops asserting what isn't true.

## Fix direction

Make the copy match what is actually supported today: Nepal→Australia is real; other
corridors are roadmap, not shipped. Either present them honestly as "coming" / not-yet, or
remove the claim. Founder owns the exact wording (it is outward marketing).

## Acceptance criteria

- [ ] The destinations surface no longer claims support for corridors the product cannot
      serve.
- [ ] Any "coming soon" framing is honest, not a disguised overclaim.
- [ ] Founder has approved the wording.
- [ ] Grep for the same claim across marketing surfaces before closing (MV-122 exists
      because the same false claim lived in two places).

## Resume notes

- Paths verified 2026-07-17: `app/(marketing)/destinations/page.tsx`, `destinations/[id]/page.tsx`.
- Pair with MV-122 (trust page upload claim) — both are the "trust page describes the system
  we actually built" theme (VERIFIED-BUILD-ORDER slice 7).
