# MV-162 — Aesthetics-report polish: typography unification + 7 hierarchy fixes

**Priority:** P2   **Owner:** agent
**Goal:** Ship the eight items from the external aesthetics review that need **no palette decision** — every one is a typography, hierarchy, layout, or placement fix that stands regardless of what the founder later decides about colour. The three colour items (a bluish palette, red-for-urgency on the dashboard readiness rows, red-for-urgency on the profile section list) are **deliberately out of scope** and are not touched by this card.

## Context links

- **Source:** external reviewer's "Aesthetics Report MyVisa" PDF (6 pages, annotated screenshots), delivered 2026-08-05. Not in-repo — the item numbering below is the numbering used when the report was read back to the founder, and it is the contract for this card.
- **Founder scope call (2026-08-05):** build items **2, 3, 6, 8, 10, 12, 14, 15**. Hold items **1, 9, 13** (all palette) for a separate decision. Item **11** is "keep as-is" (the reviewer praised the `See your program matches` card) — nothing to build, but it is a **regression target**: that card must still stand out after this card lands.
- **Design-language collisions the founder should know about:** the reviewer's palette proposal (`#2563EB` blue primary) replaces dusk plum `#6a2b57`, and "red for urgency" reuses the Reach verdict colour `#a4472f`, which would make ordinary dashboard rows read as risk signals. Both live in the held items — **this card must not pre-empt either.** No token value in `app/globals.css` `@theme` changes.
- **The design language this card DOES stay inside:** `CLAUDE.md` → Design Language. Warm paper, dusk plum, flat surfaces, thin borders, no gradients, no shadows. Sentence case everywhere. `docs/superpowers/specs/2026-06-02-onboarding-mvp-design.md` §7 for the full token reference.
- **Imagery policy is untouched:** `docs/imagery-policy.md` — the imageless product body stands. Nothing in this card adds an image.

## The eight items, as built

### Item 2 — Unify the typography (the largest item; runs first, alone)

The reviewer's actual complaint: *"the robotic like font that have going on contradicts the other font … I feel like im downloading cs cheats or something."* They saw IBM Plex Mono used for **eyebrow labels, status chips, and prose**, not just data.

**The rule this card lands, and the rule the guard test enforces:**

> **Mono is for data tokens only** — text whose value is a number, date, currency figure, range, or code (`A$33k–48k / yr`, `2026-05-28`, `A$42,600`, `STEP 1 OF 6`). **Every prose, label, eyebrow, section-kicker, status-chip, and button use switches to the sans.**

Uppercase + `tracking-wide` **stay** on the eyebrows — they are the design language's "mono-up labels" and `CLAUDE.md` permits the caps. Only the *face* changes, so the eyebrows read as refined small-caps rather than terminal output.

- Baseline measured on `origin/master` @ `65c7fdf`: **151 `font-mono` call sites across 73 files**; **102** of them carry `uppercase` or `tracking` on the same line (the eyebrow pattern `font-mono text-caption uppercase tracking-wide text-ink-faint`), **49** do not.
- This is a repo-wide sweep, not a per-screen fix. **A half-swept typography change is worse than none** — inconsistency is the exact complaint being answered.

### Item 3 — Declutter the marketing hero

`app/(marketing)/page.tsx`. The reviewer counted ~6 competing elements above the fold and asked for two specific things:
1. **Bold only "pay anyone"**, rather than running a highlight band across the whole second line.
2. **Cut some of the surrounding sentences** — the eyebrow, subhead, sourcing line and dual CTA all compete.

### Item 6 — Kill the stunted rules in the methodology section

`app/(marketing)/how/page.tsx`. Remove the thin horizontal rules around/above **"The four scoring dimensions"** — the reviewer says they *"appear stunted"*. Same note applies to the small section-kicker font at the top (which item 2 also touches). Paragraph shortening was offered as **optional** by the reviewer (*"if you want them to be well informed you don't have to reduce it"*) — **the rules go regardless; the prose stays.**

### Item 8 — Equal-height destination cards

`components/destinations/destination-card.tsx`, rendered by `app/(marketing)/destinations/page.tsx`. The 6-card grid (Australia / Canada / UK / Germany / US / Ireland) has ragged heights because descriptions run 1–2 lines and "United Kingdom" wraps against its availability chip. Cards must be equal height with the figure/date footer pinned to the bottom edge.

### Item 10 — Enlarge the journey step marker

`components/journey/journey-marker.tsx`, mounted in `app/(app)/layout.tsx`. The `Assessed · STEP 1 OF 6` strip is too small to register as the persistent progress cue it is meant to be.

### Item 12 — Make the scholarship rows stand out, and bold their titles

`components/matches/scholarships-panel.tsx`. The reviewer explicitly contrasted these rows against the `See your program matches` card (item 11) which they liked. Titles bold; rows lifted off the background with the existing flat-surface/thin-border vocabulary — **no shadows, no gradients.**

### Item 14 — Move account deletion behind a Settings tab

`components/account/delete-account-section.tsx` is rendered inline at the bottom of `app/(app)/profile/page.tsx:120`. The reviewer's reasoning is behavioural, not cosmetic: *"if it's just lying around randomly it may put that thought into their head."* A new `/settings` route owns it; the profile page stops rendering it.

### Item 15 — Guide moves from last to second in the nav

`components/layout/app-bar.tsx` (`NAV_APP`) and `components/layout/mobile-tab-bar.tsx` (`TABS`). Reviewer: *"last makes no sense."* They also floated a closeable per-page agent as the better option — **that is a much larger build and is NOT in this card**; the reorder is.

## Acceptance criteria

### A — Item 2 lands as a rule, not a sweep-by-eye

- [ ] A guard test asserts the rule mechanically: **no `font-mono` appears on a line that also carries `uppercase`** anywhere under `app/` or `components/`. It scans the live tree, so it goes red when someone reintroduces the pattern — it is not a snapshot of today's 102 sites.
- [ ] The surviving `font-mono` call sites are each a data token (number, date, currency, range, code). Any survivor that is prose is a bug, not an exception.
- [ ] The eyebrows keep `uppercase` and `tracking-wide`. A diff that also strips the caps has overshot the item — the reviewer complained about the **face**, not the caps.
- [ ] `--font-mono` and `--font-sans` in `app/globals.css` `@theme` are **unchanged**. This item re-points usage; it does not swap either family (the reviewer's "Inter" suggestion is a palette-adjacent brand call the founder has not made).

### B — Each of the seven hierarchy items has a test that fails on `origin/master`

- [ ] Item 3: hero asserts the emphasis is on **"pay anyone" alone**, and asserts the removed elements are gone.
- [ ] Item 6: `/how` renders **no `<hr>`/rule element** in the scoring-dimensions block, and the paragraph text is **unchanged** (the optional shortening was declined).
- [ ] Item 8: every destination card in the grid stretches to a common height and pins its footer — asserted structurally (`h-full` / `flex-col` / `mt-auto` contract), since jsdom has no layout engine.
- [ ] Item 10: the step marker's type scale is strictly larger than the `origin/master` baseline.
- [ ] Item 12: each scholarship title renders bold, and each row carries the lifted surface treatment.
- [ ] Item 14: `/settings` renders the delete-account section; `/profile` **does not**; the destructive control still requires typing `DELETE` (the existing confirmation contract survives the move).
- [ ] Item 15: `Guide` is at index **1** in both `NAV_APP` and the mobile `TABS`; every other entry keeps its relative order.

### C — Nothing held is pre-empted, nothing praised is regressed

- [ ] `git diff origin/master -- app/globals.css` shows **no change to any colour token**. Items 1, 9 and 13 are not started.
- [ ] The `See your program matches` card (item 11) still renders its filled-surface treatment — item 12 lifts the scholarship rows **toward** it, and must not flatten it to match.
- [ ] No image is added to the product body (`docs/imagery-policy.md`).

### D — The gate

- [ ] `npm run typecheck`, `npm run lint`, `npm test` all green, with the full-suite counts recorded on this dossier before the card moves to In Review.
- [ ] `npm run board` regenerated and committed (the MV-123 integrity guard must pass).

## Test plan

TDD per item: write the failing assertion first, confirm it fails against the current component, then implement. Tests live in `tests/` mirroring the source tree (`tests/components/…`, `tests/app/…`), vitest + jsdom.

**jsdom is blind to layout** (see the standing lesson): item 8's equal-height fix and item 10's size bump cannot be proven by measuring rendered pixels. They are asserted as a **class contract** (the element carries the classes that produce the behaviour) and confirmed by a live browser pass before the PR is called done.

## Decision log

- **2026-08-05 — Item 2's rule is "mono for data tokens only", not "adopt Inter".** The reviewer offered Inter as one option (*"or just a consistent font"*). Swapping the sans family is a brand decision the founder has not made, and it would collide with the in-flight rename/mascot work. Re-pointing mono usage answers the actual complaint (two faces fighting) without spending a brand call.
- **2026-08-05 — Item 6's paragraph shortening declined, rules removed.** The reviewer made the shortening explicitly optional and the prose is load-bearing trust copy (sourcing, verification dates). The rules were not optional.
- **2026-08-05 — Item 15 ships the reorder, not the closeable agent.** The reviewer's better idea (a per-page closeable guide) is a separate build.

## Resume notes

1. Branch `mv-162-aesthetics-report-polish` off `origin/master` @ `65c7fdf`.
2. **Item 2 runs first and alone** — it touches 73 files, several of which the other seven items also edit. Running it after (or beside) them causes avoidable conflicts.
3. The report itself is not in the repo. The item numbering above IS the contract; if a number is ambiguous, the per-item sections above are authoritative.
