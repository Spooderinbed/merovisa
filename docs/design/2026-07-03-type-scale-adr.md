# ADR — Type scale (`--text-*`)

**Status:** Proposed · **Date:** 2026-07-03 · **Card:** MV-88 · **Owner:** agent
**Decision scope:** the app's font-size vocabulary only. Motion v2, primitive
contracts, and the CSS-first / no-framer-motion call are *separate* decisions and
are **not** covered here (they remain their own future ADRs). This doc is
foldable into `docs/design/2026-07-03-elevated-calm-overhaul-spec.md` once signed
off; it lives standalone for now so it can be reviewed on its own.

---

## Context

The elevated-calm overhaul closed the primitive-completion arc — `Card` +
`VerdictPill` (MV-90), `Button` loading (MV-91), `Input` / `Select` (MV-92).
Each primitive, like the ~200 components before it, sets its font size with a
**Tailwind arbitrary value** — `text-[16px]`, `text-[14px]`, `text-[17px]` — a
raw pixel literal baked into the className.

A repo audit (2026-07-03) found **273 `text-[Npx]` occurrences across
`components/` + `app/`, spanning 15 distinct pixel values (10px → 26px):**

| px | uses | | px | uses | | px | uses |
|----|------|-|----|------|-|----|------|
| 15 | **77** | | 16 | 17 | | 19 | 3 |
| 14 | 37 | | 20 | 16 | | 22 | 2 |
| 13 | 37 | | 12 | 11 | | 26 | 1 |
| 17 | 30 | | 21 | 10 | |    |    |
| 11 | 19 | | 18 | 5  | |    |    |
|    |    | | 10 | 5  | |    |    |

The three new primitives reproduce the pattern verbatim: `button.tsx` sizes are
`text-[14px]` / `text-[16px]` / `text-[17px]`; `input.tsx` is `text-[16px]`.

**Why this is a problem:**

1. **No single source of truth for type.** There is no place to change "body
   text" once — 77 files would each need editing. The overhaul cannot evolve the
   type system without a find-and-replace across the tree.
2. **Silent drift.** 15 distinct sizes within a 16px range means four heavily-used
   values (13/14/15/16) sit 1px apart. Nothing stops a 91st component from
   reaching for `text-[15.5px]` or re-introducing a `text-[23px]`. The sprawl is
   self-perpetuating.
3. **The scale is invisible.** A reader of `program-card.tsx` sees `text-[18px]`
   and cannot tell whether that is "a title" (a semantic role) or a one-off nudge.
   The intent is lost in the literal.

Tailwind v4 is already configured CSS-first via `@theme` in `app/globals.css`
(that is where the 23 colour tokens live). Adding `--text-*` entries there makes
Tailwind generate matching utilities (`text-body`, `text-title`, …) at zero
runtime cost — the same mechanism the colours already use.

Note one inherited fact the scale must reconcile: **`body` base font-size is
`17px`** (`globals.css:189`). Most component copy deliberately dials *down* from
that to `15px`. So 17px is the paragraph default (`lead`), and 15px is the
component "body" — the scale names both rather than pretending 15 is the base.

---

## Decision

Introduce a **named 9-step type scale** as `@theme` tokens and treat it as the
**only** sanctioned source of font sizes. New code uses the utility name; raw
`text-[Npx]` becomes a lint-flaggable smell.

The scale is **faithful, not aspirational** — each step is anchored to a pixel
value the app already uses heavily, so migrating the 273 sites is overwhelmingly a
**1:1 rename** with no visual change. Only six genuine one-off sizes (10, 12, 18,
19, 22, 26 — 27 sites total) snap to their nearest step, each a **≤2px** shift.

| Token | util | px | Role | Anchor uses | Snaps in (Δ, sites) |
|-------|------|----|------|-------------|---------------------|
| `--text-caption`  | `text-caption`  | 11 | Fine print, mono-up labels, micro-meta        | 19 | `10→11` (+1, 5) |
| `--text-small`    | `text-small`    | 13 | Secondary / supporting text, timestamps       | 37 | `12→13` (+1, 11) |
| `--text-meta`     | `text-meta`     | 14 | Dense meta rows, helper / field-hint text     | 37 | — |
| `--text-body`     | `text-body`     | 15 | **Default body copy (workhorse)**             | 77 | — |
| `--text-control`  | `text-control`  | 16 | Form controls (16px = iOS no-zoom); emphasised inline body | 17 | — |
| `--text-lead`     | `text-lead`     | 17 | Lead paragraph, section intro, primary button; matches `<body>` base | 30 | — |
| `--text-title`    | `text-title`    | 20 | Card / section titles                         | 16 | `18→20` (+2, 5), `19→20` (+1, 3) |
| `--text-headline` | `text-headline` | 21 | Prompt-card / gated-teaser / hero headlines   | 10 | — |
| `--text-display`  | `text-display`  | 24 | Page headings, hero display, destination banner | 3 | `22→24` (+2, 2), `26→24` (−2, 1) |

**Proposed `@theme` block** (to be added in the *application* slice, not this ADR):

```css
@theme {
  /* Type scale — see docs/design/2026-07-03-type-scale-adr.md.
     Faithful to the pre-scale audit; anchors are the app's high-frequency sizes. */
  --text-caption: 11px;
  --text-small: 13px;
  --text-meta: 14px;
  --text-body: 15px;
  --text-control: 16px;
  --text-lead: 17px;
  --text-title: 20px;
  --text-headline: 21px;
  --text-display: 24px;
}
```

Line-height is **out of scope** for v1 — it stays per-site (`leading-*`) exactly
as today, so no vertical rhythm shifts. A future revision may pair each step with
a default line-height; this ADR deliberately does not, to keep the migration a
pure size rename.

---

## Consequences

**Positive**

- One place to evolve type. "Make body 15.5" becomes a one-line token edit.
- The 15 raw sizes collapse to 9 named intents; the role is legible at the call
  site (`text-title`, not `text-[20px]`).
- The primitives (`button`, `input`, `card`) stop hard-coding sizes and read from
  the same scale as everything else.
- A follow-up lint rule (`no-arbitrary-text-size`) can then *prevent* regression —
  impossible while the baseline is 273 arbitrary values.

**Negative / cost**

- **A 273-site migration.** Large, but ~90% mechanical rename; only 27 sites
  change pixels (≤2px each). Best done as **1–2 follow-on slices**, file-grouped,
  with byte-checked goldens on the 27 shifting sites and a founder visual pass on
  the auth-gated screens (results / dashboard / profile) where spacing is a blind
  call from here.
- The 27 snaps are a **real, if tiny, visual change** — surfaced explicitly above
  rather than buried, because the founder reviews visual precision closely.

**Neutral**

- Adds 9 CSS custom properties; no runtime cost, no bundle change (Tailwind
  generates the utilities at build time, same as the colour tokens).

---

## Alternatives considered

**A — Faithful 9-step scale (chosen).** Matches the "~9-step" intent MV-88 was
filed with. Minimises regression (263 of 273 sites are pure renames). Names the
current design honestly, including the tight 13-14-15-16 band.

**B — Disciplined 6-step modular scale** (`11 · 13 · 15 · 17 · 20 · 24`, folding
`14→15` and `16→17`). Cleaner rhythm, closer to a "real" type scale — but shifts
~90 additional sites by 1px and erases distinctions the designer made
deliberately (14 meta vs 15 body; 16 control vs 17 lead). **Rejected for v1** as a
larger visual change that should be a *conscious* design pass, not a side effect
of tokenising. Left on the table as a future refinement once the scale exists.

**C — Keep arbitrary values, add a lint allow-list.** Freezes the current 15
sizes without a rename. Rejected: it blesses the sprawl instead of resolving it,
and still gives no single source of truth to evolve type from.

**D — Adopt Tailwind's default `text-xs … text-3xl` names.** Rejected: the app
already opts out of default Tailwind colours (per CLAUDE.md), the default steps
(12/14/16/18/20/24/30) don't match the app's actual anchors (13/15/17/21), and
the semantic names (`caption`/`body`/`title`) read better in this product than
`sm`/`base`/`xl`.

---

## Open questions (for sign-off)

1. **`title` (20) vs `headline` (21)** sit 1px apart. Keep both (faithful), or
   fold `21→20` to an 8-step scale? Both are meaningfully used (16 vs 10) in
   different contexts (section titles vs hero headlines).
2. **Alternative B** — is the disciplined 6-step scale wanted *instead*, accepting
   the larger visual change now while the overhaul is already touching everything?
3. **Line-height** — pair a default `line-height` with each step now, or defer
   (v1 defers)?

---

## Migration plan (tracked separately — not this slice)

This ADR is **decision-only**. Applying it is follow-on work:

1. Add the `@theme` block above to `app/globals.css`.
2. Rename `text-[Npx]` → `text-<token>` across `components/` + `app/` per the
   snap map (script-driven; 1:1 for 246 sites, ≤2px for 27).
3. Update the three primitives (`button`, `input`, `card`) to the tokens.
4. Add the `no-arbitrary-text-size` lint rule to prevent re-introduction.
5. Goldens byte-checked; founder visual pass on auth-gated screens.

Steps 1–2 are one slice; 3–4 fold in; 5 is the founder gate.
