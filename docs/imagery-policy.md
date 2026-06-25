# Imagery policy — MyVisa

Date: 2026-06-25
Status: Binding guardrail. Read before adding any photograph, illustration, or generated
image anywhere in the product.

This policy codifies the AI-imagery strategy from
`docs/audits/2026-06-25-design-division-polish-audit.md`. It exists because MyVisa's
imageless product body is its single strongest defence against looking AI-generated or
stock-bought — the founder constraint "must not look AI-generated" is satisfied today
precisely because the data surfaces are 100% type, colour, thin borders and hand-drawn
stroke SVG. The danger is not that we lack images; it is scope creep the moment the first
photo lands.

## The rule

**No image is always an acceptable default.** The text-only system already works. Reach
for a photograph only when this policy explicitly permits it, and never to fill space.

Photography is permitted **only** on:

- **Marketing pages** — the landing hero and supported-destination headers (see "Where
  imagery is permitted" below).
- **Auth** — and only as the existing stroke-SVG marks; never a smiling-advisor stock
  photo or an AI "guide avatar".

Photography is **never** placed inside the product body:

- results, matches, plan, checklist, dashboard, profile, wizard.

These surfaces stay type + colour + border. **Verdicts stay word + colour bands
(Strong / Possible / Reach) — never illustrated, never given an icon or a photo.**

## Where imagery is permitted (and only here)

- **Landing hero** — one 4:5 portrait, banded in a flat `rounded-lg border border-line`
  container to the right of the headline. Never behind text, never a full-bleed gradient
  hero (that breaks the no-gradient rule). The HeroPreview stays below it.
- **Supported-destination headers** — one 16:9 sense-of-place photo per *supported*
  corridor only (today: Australia). Leave not-yet-available corridors flag-only — the
  absence of a photo honestly signals "not covered".

## Where imagery is forbidden — the imageless product body

- **The entire product body**: results, matches, plan, checklist, dashboard, profile,
  wizard. These read credible *because* they carry no imagery.
- **/how and /trust** — a photo on a transparency or methodology page is the single
  most stock-y, least-credible move available. Use `hr.border-line` dividers and the
  mono label system for rhythm instead.
- **Auth and the guide placeholder** — keep the existing stroke-SVG marks.
- **Empty states** — extend the hand-authored thin-stroke SVG icon family, muted to
  `text-ink-faint`. Never AI spot-art.

## Photographic style — documentary, not stock

Every admitted photo is documentary, never stock. The AI/stock tells are smooth plastic
skin, dead-centre symmetry, studio light, eye-contact grin, and hyper-saturated
travel-brochure grading. Defeat all of them on purpose:

- real camera + lens language (35mm / 50mm, f/1.4–f/4)
- available or overcast light, never studio
- off-centre framing
- no eye contact with the camera, no smile-for-camera
- visible skin texture
- fine film grain
- muted, desaturated tone
- real, lived-in rooms with specific props

## The warm-paper post-processing recipe

Apply this identically to every admitted photo so the set reads as one, not as three
separate stock buys:

1. Desaturate 15–25% so nothing out-shouts deep teal.
2. Warm white balance to ~5200K so the image sits against `#f6f5f1`.
3. Lift blacks / reduce contrast for the flat matte feel (mirrors the no-shadow rule).
4. Add fine monochromatic film grain to kill the smooth AI surface.
5. Optional low-opacity warm-paper overlay.

Always inside `border border-line rounded-lg`. Never full-bleed, never with a shadow or a
gradient scrim.

## Bias and representation guardrails

Adopt these before any image ships.

**Positive anchors:**

- A 20–24-year-old Nepali student — South Asian features, medium-brown skin, black hair —
  candid and composed.
- A real desk, home, or cafe in Kathmandu, or a real Australian campus.
- Natural light graded to render brown skin accurately, with no exoticising rim-light.
- Documentary, not stock.

**Negative bans:**

- No white / Western-default subject.
- No glossy corporate-stock smile.
- No graduation-cap-and-globe cliche.
- No poverty or pity framing.
- No clone faces.
- No gibberish Devanagari or fake Nepali signage.
- No hyper-saturated travel-brochure grading.
- No added shadows or gradients inside the image frame.

## Default

Treat "no image" as an always-acceptable default. When in doubt, ship no image.
