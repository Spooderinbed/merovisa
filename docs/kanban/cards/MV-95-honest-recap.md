# MV-95 — Overhaul Phase 1: honest recap (drop the fake 3000ms "Analyzing" theatre)

**Priority:** P2 · **Owner:** agent · **Created:** 2026-07-04
**Branch:** `mv-95-honest-recap` off `origin/master f6cada8`
**Carves:** the *honest recap* half of the overhaul spec's Phase-1 "MV-90 — Motion v2 + honest recap" item (kills audit #18). The motion-system halves (wizard slide transitions, micro-interactions) stay gated on the Motion v2 ADR (PR #48).

## Why

Every user who completes the 9-step wizard is held on a **fixed 3000ms** timer
showing "Analyzing your profile" before their result appears — regardless of when
the real result is ready. The scoring runs server-side in the `/api/assess` POST
(typically fast); the 3 seconds are pure latency theatre. For a **trust-first**
product whose whole thesis is "no fake, no theatre", faking three seconds of
analysis at the single highest-traffic funnel moment (wizard → results) is exactly
the anti-pattern the app exists to replace. This is audit #18.

Orthogonal to the unsigned type-scale (#47) / Motion v2 (#48) ADRs and the pending
mascot (MV-85): it reuses the already-sanctioned `animate-rise` keyframe + `ease`,
adds no new motion primitive, and changes timing/copy honesty, not the motion
system — so it lands ahead of full ADR sign-off (like MV-94 did for item 1).

## What (mechanic)

`components/assess/profile-recap.tsx` only. The transition in `AssessFlow` is
already gated on `payload && recapElapsed`, where `recapElapsed` is driven by
`ProfileRecap`'s `onDone` timer. So results appear at **max(real API latency,
reveal window)**. The fix shortens the reveal window so it never *pads* the wait:

- **`durationMs` default `3000` → `600`** — a genuine reveal beat, not a work
  claim. Slow API → honestly waits for the payload (unchanged); fast API → ~600ms
  confirmation, not a 3s hold.
- **Stagger `i * 0.5s` → `i * 0.08s`** — the summary lines reveal fast enough to be
  seen within the shortened window (spec: "fast 0.4s stagger").
- **Label "Analyzing your profile" → "Your answers"** — an honest summary label,
  not a fake-work claim. The existing pulse dot honestly signals in-flight work.

Auto-advance kept (vs the spec's "explicit See my result →" alternative) —
lower-friction, more honest, smaller change. No `AssessFlow` change needed.

## Test plan (TDD, red-first)

New `tests/assess/profile-recap-timing.test.tsx` (RTL + fake timers), both RED
against the 3000ms code, GREEN after:
1. `onDone` fires within a short reveal window (advance 800ms → called once) — was
   held to 3000ms.
2. The rendered reveal still shows the answer summary ("Nepal") but never matches
   `/analyz/i`.
Deliberately does **not** pin the exact new copy or stagger value (founder-tunable
taste); locks only the two objective trust invariants.

## Evidence

- Change: `components/assess/profile-recap.tsx` — `durationMs 3000→600`, stagger
  `0.5→0.08`, label `Analyzing your profile → Your answers`.
- Test: `tests/assess/profile-recap-timing.test.tsx` +2 (red-first verified);
  existing `recapLines` tests untouched + green.
- Gate: `tsc --noEmit` exit 0 · lint clean on changed files · full suite — see Ship.

## Blind-call flags (for founder / Vercel-preview review)

The recap is behind wizard completion, so exact feel is a blind call:
- **Copy:** "Your answers" is my honest minimal reframe — founder copy call
  ([[copy-precision-in-generators]]); the trust invariant (no fake "analyzing") is
  what the test locks, not this exact string.
- **Timing:** 600ms window + `i * 0.08s` stagger are sensible but unverified in
  preview; tune on the results-preview sweep.
- **Design fork:** auto-advance chosen over an explicit "See my result →" button —
  founder can flip to the button variant if preferred.

## Ship

**SHIPPED 2026-07-04 → PR [#50](https://github.com/Spooderinbed/merovisa/pull/50)** (branch `mv-95-honest-recap` off
`origin/master f6cada8`). In Review, founder-gated merge (never self-merged).
Independent slice — single file `profile-recap.tsx` + new test, disjoint from the
6 in-flight overhaul branches; board card appended at END of the array to auto-merge.

## Resume notes (cold start)

Fake-analysis theatre gone from the wizard→results handoff. Remaining spec-MV-90
motion work (direction-aware wizard transitions, option/segmented/slider
micro-interactions) is a **separate, ADR-gated** slice — do NOT fold it here.
