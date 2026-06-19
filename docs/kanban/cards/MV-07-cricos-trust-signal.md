# MV-07 — Surface CRICOS provider codes as a verifiability signal

**Status:** Done pending review (gate green; committed local, push gated on the Vercel question).
**Owner:** agent · **Priority:** P2

## Why the scope changed (premise disproven at kickoff)

The card was originally "CRICOS scrape pipeline → providers + evidence tables → a real
per-provider Genuine-Student answer." Kickoff discovery (Codex triangulation + codebase
map, then direct verification) found most of that **already shipped**:

- **The CRICOS "scrape" is done.** `lib/data/source/au-cricos-codes.ts` already holds 70+
  provider codes (universities, pathway colleges, VET/RTOs), each Zod-validated and
  gate-checked against `used` findings (category D, `lastVerified` 2026-06-07).
- **The GS panel already exists and is rich** — `components/results/genuine-student.tsx`
  renders five gov-sourced sections (Direction 106, SSVF evidence-level, English rules),
  each linking its source. It was never a "static link."
- **But the sourced CRICOS data was dormant** — referenced only by its source, schema, and
  the registry; **no component, scorer, or page consumed it.** Value sourced, never seen.

Founder steer (AskUserQuestion, 2026-06-19): **surface the dormant CRICOS data as a
verifiability trust signal** (recommended slice), over a speculative DB mirror or
sourcing-blocked per-provider evidence levels.

## What this slice does

Show each matched program's **provider CRICOS code** on the program card as a verifiable
link to the official register — pure TS over the already-sourced fact layer, no DB, no
scorer. Reinforces the verifiability brand by realizing data already paid for.

## Acceptance criteria

- [x] A pure lookup maps a catalogue university id → its sourced CRICOS record, or null.
- [x] Mapping is **explicit, not name-derived** (catalogue "University of Adelaide" → the
      merged "Adelaide University" 04249J; a name match would miss it).
- [x] Universities with no sourced code (Melbourne D.055, ANU D.056) resolve to null and
      render **nothing** (no broken/empty trust line).
- [x] Program card renders `CRICOS <code> ↗` linking to the register when sourced; renders
      nothing when not.
- [x] No scoring change; goldens untouched (fact-layer/UI only).

## Test plan / evidence

- `tests/data/cricos-lookup.test.ts` (new, 5 tests): resolves codes; explicit-not-name
  (Adelaide); null for Melbourne/ANU/unknown; integrity guard that all 13 mapped catalogue
  ids resolve to a well-formed `\d{5}[A-Z]` code (catches target typos).
- `tests/components/matches/program-card.test.tsx` (+2): renders the CRICOS link with the
  correct code + register href when sourced; renders no CRICOS line when unsourced.
- Gate: `typecheck` clean · `lint` 0 errors · full suite **1128 passed** (+7).

## Files

- `lib/data/cricos-lookup.ts` (new) — `cricosCodeForUniversity(id)` + explicit map.
- `components/matches/program-card.tsx` — renders the trust line in the footer.
- Tests as above.

## Deferred (explicitly out of this slice)

- `providers` / `provider_evidence_nepal` **Postgres tables** — speculative until a
  query-heavy consumer exists (no surface queries them today).
- **Per-provider SSVF evidence levels** — volatile, often non-public data; sourcing-blocked
  like OSHC. Revisit if/when a sourced, verifiable dataset is available.
- Surfacing CRICOS on the university/dashboard surfaces beyond the program card.
