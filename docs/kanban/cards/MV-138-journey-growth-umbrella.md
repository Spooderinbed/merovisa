# MV-138 — Umbrella: journey depth, growth loops, orphaned data (audit F-5/F-7–F-14/F-18/F-21/F-22/F-24)

**Priority:** P2 · **Owner:** agent + founder · **Merge:** _founder-gated_
**Umbrella — do NOT build from this directly.** Split a scoped card off when a slice starts.
Tracked so the audit's journey/growth half stops living only in the report file.
**Source:** 2026-07-10 audit, confirmed uncarded 2026-07-17. Much of this is the audit's own
"next month" phase — roadmap, not P0.

## Why

These deepen the self-serve journey and build the re-engagement/growth loops. The north star
says every self-serve dead-end is a consultancy bounce; several items here ARE dead-ends. But
they are larger, some are founder/product calls, and they should be sequenced deliberately
rather than dumped as 14 cards.

## Contents (each becomes its own card when picked up)

**Highest ROI — pull this out first:**
- **F-11 — five sourced data modules render to zero surfaces.** The data exists; nothing
  displays it. Claude's audit flagged this as the highest-ROI item: shipping value already
  paid for. Strong candidate for the next real card.

**Trust-sensitive (verify before deferring):**
- **F-21 — fabricated placeholder policy tables for unsupported destinations.** If real
  placeholder data ships as fact, this is closer to a trust P0 than roadmap; pairs with
  MV-134 (destinations copy) / F-22.
- **F-5 — the heuristic verdict core is undisclosed** while `/how` implies a
  government-derived method. Disclosure honesty.

**Journey depth:**
- **F-9** — no human fallback on dead-ends; no `/about`.
- **F-10** — journey hard-stops at track-visa; the post-grant stages are absent (MV-57 built
  the pre-grant spine only).
- **F-13** — no Reach off-ramp (improve-your-odds paths). MV-121 only *reveals* the hidden
  Reach cards; it explicitly deferred the guidance surface to "its own card" — this is it.
- **F-14** — application tracking is a 3-value dropdown, not a real tracker.
- **F-12** — no Genuine-Student / GTE workspace.

**Growth / re-engagement (needs founder + likely email capability):**
- **F-6** — Google-only sign-in; no email auth.
- **F-7** — 3-day expiry is silent; no deliver-a-copy, no reminder (no email sender in repo).
- **F-8** — no re-engagement loop / channel-correct share.
- **F-24** — no distribution plan; the `assessment_claimed` analytics event is missing.

**Correctness / infra debt:**
- **F-18 (residual)** — freshness guard covers ~23 of ~498 dated facts; systemic `reverifyBy`
  expansion + monthly-harvest automation uncarded (MV-04/26/80 built the mechanism).
- **F-22** — "expansion without code changes" is false; hardcoded corridor assumptions + no
  i18n. Includes correcting the CLAUDE.md claim. Pairs with MV-134/F-21.

## How to work this

Sequence by student outcome, not list order. F-11 (wire the orphaned modules) and F-13 (Reach
off-ramp) are the strongest self-serve-completeness picks; the growth loops (F-6/7/8/24) need
a founder call on email capability first (see [[gmail-outcome-capture-feasibility]] for why
inbox-scan was rejected — forward-to-address + upload won).

- [ ] F-11 wire orphaned modules · [ ] F-13 Reach off-ramp · [ ] F-21 placeholder policy data
- [ ] F-5 disclose heuristic · [ ] F-9 human fallback + /about · [ ] F-10 post-grant journey
- [ ] F-12 GS/GTE workspace · [ ] F-14 real tracker
- [ ] F-6 email auth · [ ] F-7 deliver-a-copy + reminder · [ ] F-8 re-engagement/share · [ ] F-24 distribution + event
- [ ] F-18 systemic freshness · [ ] F-22 de-hardcode + CLAUDE.md fix

## Resume notes

- Roadmap tier: comes after the P0s (MV-134/135/136) and the correctness gaps (MV-129–133).
- Several items are founder/product calls; do not build the growth loops without a founder
  steer on email + distribution.
