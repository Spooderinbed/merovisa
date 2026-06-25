# Design division polish audit — MyVisa

Date: 2026-06-25
Author: Design division lead (synthesis of 9 specialist audits)
Scope: Nepal → Australia MVP. Trust-first positioning. "Calm authority" design language.

---

## Executive summary

MyVisa is more crafted than most flat-design MVPs, and its strongest asset is also its
biggest liability protection: the product body is entirely type, colour, thin borders and
hand-drawn stroke SVG — zero photography, zero stock, zero AI-looking imagery. That restraint
is exactly what the founder's "must not look AI-generated" constraint is asking us to defend.
The copy on the trust-critical marketing surfaces (/trust, /how, TrustStrip) is plain-spoken,
specific and genuinely disarming for a burned 20-24yo Nepali student.

The problems are not in the writing or the palette. They cluster in three places. First, a
**foundational accessibility gap**: there is no `:focus-visible` ring anywhere, no
`prefers-reduced-motion` guard, and the complete dark-mode token set is dead code behind a
hardcoded `data-theme="light"`. All three are confirmed in source. Second, a **conversion seam
that quietly contradicts the brand**: the anonymous `/api/assess` path returns `200` with
`id: null` on a persist miss (confirmed at route.ts:69-131), which silently disables every save
CTA; the only retention door is Google OAuth; and the /auth email fallback is a primary-looking
button that only says "coming soon". Third, **small credibility leaks** that a skeptical eye
registers: seven footer links point at anchors and pages that do not exist (confirmed — no
matching ids in /trust or /how), the landing sells an "AI guide" and "feed" present-tense while
/guide is a placeholder, verdict band labels are worded five different ways, and the accuracy
meter renders a raw percentage in amber — the one place the no-raw-numbers discipline slips and
collides with the "Possible" verdict colour.

None of these break the visual language. They erode the trust narrative through fixable detail.
The recommended path is inside-out: ship the cheap honesty and a11y fixes first, then extract a
small set of shared primitives, then — and only then — add at most two heavily-treated
documentary photographs to marketing surfaces, leaving the data body imageless forever.

---

## Convergence — what multiple specialists independently flagged

These are the highest-signal items because separate lenses arrived at them without coordination.

1. **No focus-visible ring anywhere (P0).** Flagged independently by UI Designer, Implementation
   Foundation, and (as a polish tell) Whimsy. Confirmed: `app/globals.css` has zero focus rules;
   inputs use `outline-none` with only a 1px border swap. A single base-layer teal ring fixes
   every surface at once.

2. **No prefers-reduced-motion guard (P1).** Flagged by Implementation Foundation and Whimsy.
   Confirmed: zero matches in app/ and components/. The app animates real content (verdict rise,
   factor bars, profile recap) unguarded.

3. **AccuracyMeter renders a raw percentage in amber (P2).** Flagged by UI Designer, Brand
   Guardian, Visual Storyteller, and Persona/CRO — four lenses. Confirmed: `width: ${completeness}%`
   on a `bg-accent` fill, and `--accent` is the exact hex of `--possible`. It breaks the
   no-raw-numbers promise AND collides with verdict semantics.

4. **Verdict band labels worded inconsistently across surfaces (P1-P2).** Flagged by UI Designer
   and Brand Guardian. "Strong match" / "Strong matches" / bare "Strong" / bare "Reach" coexist
   for the brand's core three-word vocabulary. Needs one canonical `VERDICT_LABELS` map.

5. **The anonymous result cannot survive without Google (P0).** Flagged by Usability and
   Persona/CRO; root cause (`id: null` 200) confirmed in `app/api/assess/route.ts`. The disabled-
   CTA symptom and the OAuth-only retention door are the same wound seen from two angles.

6. **Verdict-band pill / card shells re-implemented per surface (P1-P2).** Flagged by UI Designer
   and Brand Guardian — the pill is hand-rolled 4× with divergent sizes; the card shell string is
   copy-pasted ~10×. Root cause of the radius/label drift.

7. **Imagery is a net liability in the product body; protect the imageless zone (P0 guardrail).**
   Flagged by Image Prompt Engineer AND Inclusive Visuals as the single most important imagery
   decision — and reinforced by Persona/CRO ("do NOT add stock student photos").

---

## Prioritized findings

Ranked by impact × (low) effort. Severity is the worst assigned by any lens.

| # | Finding | Sev | Effort | Flagged by | Surfaces | Fix |
|---|---------|-----|--------|-----------|----------|-----|
| 1 | No `:focus-visible` ring on any control | P0 | S | UI, Impl, Whimsy | globals.css (none); button/option-card/segmented/tabs/inputs | One `@layer base` rule: `2px solid var(--primary)`, offset 2px, radius inherit, on all interactive `:focus-visible`. Drop bare `outline-none`. |
| 2 | Anonymous result survives only via Google; `id:null` 200 silently disables save CTAs | P0 | M | Usability, CRO | api/assess/route.ts:69-131; conversion-prompt/paths; university-matches | Return a `persisted:false` flag (not silent null) → show retry; add a no-account "copy result link" / email-to-self path; demote OAuth to one of two doors. |
| 3 | Footer links point at non-existent anchors/pages | P0 | S | Brand | footer.tsx:10-30 (#sources/#privacy/#about/#contact/#careers/#guide/#sop) | Add the real anchor ids to /trust + /how OR prune to links that resolve. Remove About/Careers until those pages exist. Confirmed: no matching ids. |
| 4 | Codify imageless product body (written rule) | P0 | S | Image, Inclusive, CRO | all (app)/ verdict/data surfaces | Document: photography only on marketing + auth; never inside results/matches/plan/checklist/dashboard/wizard. Verdicts stay word+colour bands. |
| 5 | No `prefers-reduced-motion` guard | P1 | S | Impl, Whimsy | globals.css:40-62 keyframes; verdict-card; factor-bars; profile-recap; progress-dots | One `@media (prefers-reduced-motion: reduce)` block zeroing animation/transition duration; keep opacity end-states. |
| 6 | /auth email fallback is a primary-looking "coming soon" button | P1 | S | Brand, CRO | auth-card.tsx:23-26,57-63,82-86 | Don't render a functional-looking submit that only apologizes. Remove it, or make it an honest waitlist. |
| 7 | Landing sells "AI guide" + "feed" present-tense; /guide is a placeholder | P1 | S | Brand | marketing/page.tsx:75-101; hero-preview.tsx; guide/page.tsx | Add "Soon" badge to the AI-guide tile (mirror SOP coach, which already has it); soften "Your feed, once you're in". |
| 8 | AccuracyMeter: raw % fill in amber (no-raw-numbers + verdict-colour collision) | P2 | S | UI, Brand, Storyteller, CRO | accuracy-meter.tsx:13-16 (bg-accent, width %) | Recolour fill to `--primary`; band the fill to discrete steps OR replace with "3 of 5 areas covered". Reserve amber for verdicts. |
| 9 | Verdict band labels worded 5 ways | P1 | M | UI, Brand | verdict-card; verdict-group; program-card; destination-detail; outcome-funnel | One `VERDICT_LABELS` map in lib; group headers append "(N)" at call site only. |
| 10 | Possible-amber fails text contrast (~3.6:1 < 4.5:1) | P2 | S | Impl | globals.css:84-85; verdict-card | Split into a fill token + a darker `possible-ink` text token (~#8a6212). |
| 11 | matches-tabs: no tab semantics, colour-only selection, no focus | P1 | M | Impl | matches/matches-tabs.tsx:10-23 | Promote to real tablist (aria-selected/controls, roving tabindex) or reuse the Segmented radiogroup. |
| 12 | Extract `VerdictPill` + `Card` primitives; fix radius/padding drift | P1 | M-L | UI, Brand | verdict pill 4×; card shell ~10×; rounded-xl off-scale on document-card | One pill + one card/panel primitive; bake role→radius (8 input / 12 card / 16 panel). |
| 13 | Bespoke pill-buttons lack disabled/loading contract | P1 | M | UI | shortlist-button; plan-item-card; document-card ("Uploading…"/"Loading...") | Give them `disabled:opacity-50 disabled:pointer-events-none`; standardize loading copy + busy affordance. |
| 14 | Dark-mode tokens are dead code behind hardcoded light | P1 | M | Impl | globals.css:90-113; layout.tsx:27 | Pre-hydration `matchMedia` prefers-color-scheme, or a light/dark/system toggle. Keep the `background-color` rule. |
| 15 | Outcome "funnel" shows no progression | P1 | M | Storyteller | outcomes/outcome-funnel.tsx | Add a thin stepped rail per row (Applied → Offer → Visa lodged → Granted), flat dots + mono labels. |
| 16 | Intake timing has no timeline | P1 | M | Storyteller | results/intake-timing.tsx | Render a tick-timeline with a "now" marker, status-coloured intake ticks. |
| 17 | Genuine Student "four questions" collapsed by default | P1 | S | Storyteller | results/genuine-student.tsx:31 | Open "The questions you'll answer" by default; number them 1-4 with mono numerals. |
| 18 | 3s fixed "Analyzing your profile" fake-loading theatre | P1 | S | CRO | assess/profile-recap.tsx:48-54 | Cut the artificial delay or make it skippable; drop "Analyzing…" for an honest "Here's what you told us". |
| 19 | Two-marketing-flag emoji vs bordered-chip drift; tofu-box risk on Windows | P2-P3 | M | Brand, Inclusive | hero-preview.tsx:32; destination components; destinations.ts | Replace flag emoji with a bordered IBM Plex Mono ISO-code pill or flat single-colour SVG; render a quiet NP home nod. |
| 20 | "~2 minutes" claim unsubstantiated vs 9-step flow; phrasing drift | P3 | S | Brand | marketing/page.tsx; snapshot-card; destination-detail | Verify real median; use an honest range or "9 quick questions"; standardize phrasing. |
| 21 | Two accordion implementations diverge (profile one lacks chevron) | P2 | M | UI | ui/disclosure.tsx; profile/section-accordion.tsx | Fold section-accordion onto the primitive with an optional trailing slot. |
| 22 | Two step counters disagree ("6 of 8" beside "Step 7") | P1 | S | Usability | wizard.tsx:68-71; use-wizard-state.ts; gap.ts | Derive the eyebrow from live position or drop it; one counter. |
| 23 | Corridor (destination) question buried at Step 7 | P1 | M | Usability | use-wizard-state.ts:40-50; destination-step.tsx | Move destination to/near Step 1 so coverage is known before effort. |
| 24 | Completeness ring + plan "Done" + checklist tick are inert | P2 | S-M | Whimsy | completeness-ring.tsx; plan-item-card; checklist-item.tsx:26-27 | Add `transition-[stroke-dashoffset]` to the ring arc; ease plan-card state; replace literal "✓ " string with the styled option-card checkmark. |
| 25 | Verdict reveal has no more weight than any sibling card | P1 | M | Whimsy | verdict-card.tsx:56; results.tsx | Give ONLY the verdict a two-beat reveal (card rises, band pill settles ~120ms later); optional staggered factor bars. |
| 26 | Bar/meter fills use different colours for the same element | P3 | S | UI | factor-bars (primary) vs accuracy-meter (accent) | One fill colour for neutral progress (teal); shared `Meter` markup. |
| 27 | Empty/success states visually inert | P3 | M | Whimsy | plan-list; prompt-card; checklist | One restrained hand-SVG teal mark on genuine success states only (not error/incomplete). |
| 28 | Checklist↔Plan relationship asserted in copy, never shown | P2 | M | Storyteller | checklist-view; plan-list; checklist-stage-section | Surface planState as a mono status chip on ChecklistItem; show stage tag on PlanItemCard. |
| 29 | No authority signal above the fold | P2 | S | CRO | marketing/page.tsx hero | One true sourcing line: "Built on official Home Affairs and university data — every figure shows its source and date." No fake metrics, no stock photos. |
| 30 | Greeting assumes Western single-given-name; no timezone grounding | P3 | S | Inclusive | dashboard/greeting.tsx | Use whole name for one-token names; ground partOfDay in Asia/Kathmandu (UTC+5:45) or go time-neutral. |

---

## Per-lens summaries

### 1. Visual design system (UI Designer)
"Calm authority" is real and well-honored — flat surfaces, thin borders, no shadows/gradients,
disciplined mono labels, semantic verdict triad. Weaknesses are system-level: no shared
focus-visible (P0), the verdict pill re-implemented 4× with divergent sizes/labels (P1), radius
semantics drift from spec across cards/panels/inputs (P2), ad-hoc disabled/loading on bespoke
pill-buttons (P1), two accordion implementations (P2), card shell copy-pasted ~10× instead of a
`Card` primitive (P2), and bar/meter fills using different colours for the same element (P3). The
fix is a tightening pass: a few shared primitives so the UI reads as engineered, not assembled.

### 2. Usability (Nielsen heuristics)
Three findings. The `id:null` anonymous save (P0) disables every conversion CTA with no reason —
reads as bait-and-switch. Two step counters disagree ("6 of 8" beside "Step 7", P1). The corridor
question is buried at Step 7, so a Canada-bound student answers six screens before learning the
corridor is unsupported (P1).

### 3. Implementation foundation (tokens, dark mode, a11y, perf)
Tokens are strong; the foundation has a11y gaps. No focus indicator anywhere (P0, fails WCAG
2.4.7/1.4.11). No prefers-reduced-motion (P1, WCAG 2.3.3). Dark-mode tokens are dead code behind
hardcoded light (P1). matches-tabs has no tab semantics and colour-only selection (P1, WCAG 1.4.1).
"Possible" amber fails text contrast at ~3.6:1 (P2). All confirmed in source.

### 4. Brand consistency & credibility (Brand Guardian)
Marketing copy is the strongest part of the brand — plain-spoken, specific, disarming. The
credibility problems are in details that contradict the promise: footer "Trust"/"Company" links
to non-existent anchors/pages (P0, confirmed), the landing sells an unbuilt AI guide present-tense
without a "Soon" badge while the SOP tile is honestly badged (P1), verdict labels worded
inconsistently (P2), the accuracy meter's amber colliding with the "Possible" verdict (P2), the
unsubstantiated "~2 minutes" claim (P3), and marketing emoji flags vs the app's bordered-chip
treatment (P3).

### 5. Visual narrative & data communication (Visual Storyteller)
The journey is honest and well-sequenced in prose, but storytelling is carried almost entirely by
stacked text cards. The two surfaces literally named for progression — the outcome "funnel" and
"intake timing" — show no funnel and no timeline (both P1). The Genuine Student "four questions",
the highest-anxiety content, is collapsed by default (P1). The verdict→bars jump lacks a "why this
band" bridge (P2). AccuracyMeter exposes a raw % against the no-raw-numbers rule (P2). The
Checklist↔Plan relationship is asserted in copy but never shown (P2). All fixable with the existing
flat-border, mono-label vocabulary — no decoration needed.

### 6. Delight & personality (Whimsy Injector)
More crafted than typical flat design; restraint is correct. But delight is uneven: no
prefers-reduced-motion guard despite real content motion (P1); the verdict reveal — the product's
whole reason to exist — has no more weight than any other card (P1); the completeness ring snaps
instead of animating (P2); marking Done / ticking a checklist item gives no completion beat, with
a literal "✓ " string prefix (P2); the Applied commitment confirms with nothing (P2); save
feedback and empty states are inert (P3). Every fix stays inside calm-authority — no spinners, no
confetti.

### 7. AI-imagery strategy (Image Prompt Engineer)
The imageless body is the app's main defense against the AI/stock look — protect it as a written
rule (P0). Exactly two surfaces earn one heavily-treated documentary photo each: the landing hero
(banded beside the headline, never behind text) and supported-destination headers (Australia only,
P1). Define a single warm-paper post-processing recipe so every admitted photo binds to #f6f5f1
(P1). /how and /trust stay text-only (P2). Empty states use hand-SVG, never AI illustration (P2).

### 8. Representation & cultural authenticity (Inclusive Visuals)
Zero human imagery today — a strength for the no-AI constraint, so the risk is latent. The single
highest-leverage decision is currently unguarded: adopt a written prompt + negative-prompt policy
before any photo ships, anchored on authentic 20-24yo Nepali students (P1). Make Nepal→Australia
specificity visible in COPY, not pixels (P2). Replace emoji flags (tofu boxes on Windows) with a
mono ISO pill or flat SVG, and give the Nepali user a quiet NP nod (P2). Minor: greeting name
parsing and timezone grounding (P3).

### 9. Persona cognitive walkthrough — CRO (Persona Walkthrough Specialist)
The landing → wizard → results spine is genuinely strong for a skeptical persona; trust peaks at
the banded verdict. Failures cluster at the conversion seam: result survives only via Google with
no email/anonymous path (P0); the /auth email fallback is a fake "coming soon" primary button (P1);
the 3s fixed fake-loading recap (P1); CTAs render silently disabled when `assessmentId` is null
(P1); AccuracyMeter raw % (P2); weak give-before-ask (P2); no authority signal above the fold (P2).
Every fix stays flat, paper, teal, sentence-case.

---

## AI-imagery strategy

This merges Image Prompt Engineer + Inclusive Visuals + Brand Guardian into one coherent plan. The
governing truth: **MyVisa's imageless body is its strongest defense against looking AI-generated.**
The danger is not "we lack images" — it is scope creep the moment the first photo lands. So the
strategy is mostly about where NOT to put imagery, and a tight recipe for the two places it earns
its place.

**Where imagery is permitted (and only here):**
- The landing hero — one 4:5 portrait, banded in a flat `rounded-lg border border-line` container
  to the RIGHT of the headline. Never behind text, never a full-bleed gradient hero (that breaks
  the no-gradient rule). HeroPreview stays below it.
- Supported-destination headers — one 16:9 sense-of-place photo per SUPPORTED corridor only
  (today: Australia). Leave not-yet-available corridors flag-only — that honestly signals "not
  covered."

**Where imagery is forbidden — make it a written rule:**
- The entire product body: results, matches, plan, checklist, dashboard, profile, wizard. These
  are 100% type+colour+border today and that is WHY they read credible. Verdicts stay word+colour
  bands, never illustrated.
- /how and /trust — photos on a transparency/methodology page are the single most stock-y,
  least-credible move available. Use more `hr.border-line` dividers and the mono label system for
  rhythm.
- Auth and the guide placeholder — keep the existing stroke-SVG marks. No smiling-advisor stock,
  no AI "guide avatar."
- Empty states — extend the hand-authored thin-stroke SVG icon family (IconShield/IconGuide/IconDoc),
  muted to text-ink-faint. Never AI spot-art.

**Photographic style (the anti-AI tells, defeated on purpose):** documentary, not stock. The AI
tells are smooth/plastic skin, dead-centre symmetry, studio light, eye-contact grin, hyper-saturated
travel-brochure grading. Defeat all of them: real camera + lens language (35mm/50mm f/1.4-f/4),
available/overcast light, off-centre framing, no eye contact, visible skin texture, fine film grain,
muted desaturated tone, real lived-in rooms with specific props.

**The warm-paper post-processing recipe (apply identically to every admitted photo so the set reads
as one, not three stock buys):** (1) desaturate 15-25% so nothing out-shouts deep-teal; (2) warm
white balance ~5200K to sit against #f6f5f1; (3) lift blacks / reduce contrast for the flat matte
feel (mirrors the no-shadow rule); (4) fine monochromatic film grain to kill the smooth AI surface;
(5) optional low-opacity warm-paper overlay. Always inside `border border-line rounded-lg`, never
full-bleed, never with a shadow or gradient scrim.

**Bias / representation guardrails (adopt as docs/imagery-policy.md BEFORE any image ships):**
- POSITIVE anchors: a 20-24yo Nepali student (South Asian features, medium-brown skin, black
  hair), candid and composed, a real desk/home/cafe in Kathmandu or a real Australian campus,
  natural light graded to render brown skin accurately (no exoticising rim-light), documentary not
  stock.
- NEGATIVE: no white/Western-default subject, no glossy corporate stock smile, no
  graduation-cap-and-globe cliche, no poverty/pity framing, no clone faces, no gibberish Devanagari
  or fake Nepali signage, no hyper-saturated travel-brochure grading, no added shadows/gradients in
  the image frame.
- Treat "no image" as an always-acceptable default. The text-only system already works.

**Ready-to-use example prompts:**

1. Landing hero (4:5 portrait):
   > Candid documentary photograph of a 22-year-old Nepali woman at a cluttered wooden desk in a
   > modest Kathmandu apartment, reviewing printed university papers by warm window light, shot on
   > Fujifilm X-T4 with 35mm f/1.4 at f/2, natural late-afternoon side light from camera left, soft
   > shadow falloff, slightly imperfect framing, visible skin texture and a few stray hairs, faint
   > film grain, muted desaturated tones, no eye contact with camera, no smile-for-camera, real
   > lived-in room with a power strip and a chai glass, 35mm reportage, Kodak Portra 400 colour, not
   > retouched.
   > Negative: studio lighting, glossy, perfect symmetry, plastic skin, stock-photo grin, corporate
   > office, lens flare, HDR, vignette, watermark, Western/white subject, graduation cap.

2. Australia destination header (16:9):
   > Documentary photograph of an ordinary university campus walkway in Melbourne on an overcast day,
   > a few international students walking with backpacks seen from behind at middle distance, brick
   > and eucalyptus, shot on Canon EOS R6 with 50mm f/1.8 at f/4, flat soft overcast light, no
   > dramatic sky, candid unposed, slight motion in one figure, fine grain, muted naturalistic colour
   > graded toward warm paper, 50mm reportage, no people facing camera.
   > Negative: tourist landmark, Sydney Opera House postcard, blue-sky travel-brochure, drone hero
   > shot, vibrant saturation, lens flare, strangers smiling, stock travel photo.

3. Optional secondary marketing portrait (4:5), male subject for set balance:
   > Candid documentary photograph of a 23-year-old Nepali man in a small Kathmandu cafe, looking at
   > a laptop with printed documents beside a cup of tea, shot on a 35mm prime at f/2, soft overcast
   > daylight from a side window, off-centre composition, natural medium-brown skin rendered
   > accurately, visible texture, faint film grain, muted desaturated palette toward warm paper, no
   > eye contact, unposed, reportage style.
   > Negative: studio glamour, glossy retouch, symmetrical centre framing, corporate suit, stock
   > smile, saturated colour, white/Western subject, exoticising rim-light, clone face.

---

## Phased roadmap

### Phase A — quick wins / inside-out polish (cheap honesty + S-effort a11y)
The cheapest credibility and accessibility wins; mostly copy, CSS, and one-line fixes.
- One `:focus-visible` ring in `@layer base` (#1).
- One `prefers-reduced-motion` block (#5).
- Fix or prune the dead footer links; remove About/Careers (#3).
- Badge the AI-guide tile "Soon" + soften the "feed" copy (#7).
- Recolour the AccuracyMeter to teal and band/relabel it (#8).
- Replace the fake "coming soon" /auth email button (#6).
- Remove/skip the 3s fake-loading recap (#18).
- Fix the disagreeing step counters (#22).
- Open the Genuine Student questions by default and number them (#17).
- Possible-amber text-contrast token (#10).
- "~2 minutes" honesty + phrasing (#20); add one authority line above the fold (#29).
- Write the imageless-body rule + imagery-policy.md (#4, #8 from imagery strategy).

### Phase B — foundational system + a11y + conversion (M-L effort)
The structural pass that stops the drift and closes the trust-critical conversion wound.
- Fix the anonymous `id:null` path: return `persisted:false`, add a no-account retain path
  (copy-link / email-to-self), demote OAuth to one of two doors (#2).
- Extract `VerdictPill` + `Card`/`Panel` primitives; bake role→radius; route the heavy surfaces
  through them; centralize `VERDICT_LABELS` (#9, #12).
- Give bespoke pill-buttons the disabled/loading contract (#13).
- Promote matches-tabs to a real tablist (#11).
- Wire dark mode (prefers-color-scheme or toggle) (#14).
- Fold the two accordions into one primitive (#21).
- Move the destination question to Step 1 (#23).
- The progression visuals: outcome funnel rail, intake timeline, Checklist↔Plan chips,
  verdict→bars bridge (#15, #16, #28).
- The completion beats: animated ring, eased Done, styled checkmark, two-beat verdict reveal (#24, #25).

### Phase C — the visual / imagery layer (only after A + B)
With the policy written and the system tightened, introduce imagery deliberately.
- One treated documentary photo on the landing hero, banded beside the headline.
- One treated 16:9 photo on the Australia destination header.
- Apply the single warm-paper post-processing recipe to both so they read as one set.
- Replace emoji flags with mono ISO pills / flat SVG; add the quiet NP home nod (#19).
- Hand-SVG marks on genuine success empty states (#27).

---

## Appendix — the 9 audit agents and their remits

1. **UI Designer** — Visual design system: consistency, component reuse, color/radius discipline,
   component states.
2. **UX Researcher (Usability)** — Nielsen heuristics across the core flow.
3. **UX Architect (Implementation foundation)** — tokens, dark mode, accessibility, performance.
4. **Brand Guardian** — brand consistency & credibility vs "calm authority" + trust-first positioning.
5. **Visual Storyteller** — visual narrative & data communication.
6. **Whimsy Injector** — delight & personality within calm-authority limits.
7. **Image Prompt Engineer** — AI-imagery strategy: where photography helps vs cheapens, and
   AI-look-proof prompts.
8. **Inclusive Visuals Specialist** — representation & cultural authenticity (Nepal → Australia).
9. **Persona Walkthrough Specialist** — CRO cognitive walkthrough (LIFT / Cialdini / Fogg), wary
   22yo Nepali student on mid-range Android.

Verified against source on 2026-06-25: no focus-visible rule, no prefers-reduced-motion,
`data-theme="light"` hardcoded, footer anchors absent in /trust + /how, AccuracyMeter `bg-accent`
raw %, anonymous `/api/assess` returns `id:null` on persist miss.
