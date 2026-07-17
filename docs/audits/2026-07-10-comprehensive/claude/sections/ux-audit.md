# UX Audit — LandingPad (MeroVisa)

_Audited 2026-07-10 · principal UX lens · Nepal→Australia corridor · judged within the deliberate "calm authority" + imageless-product-body intent._

## Frame

I judged restraint as a design position, not a defect. The error boundaries, the honest dead-ends, the sourced provenance lines, the persist-miss retry, the reduced-motion handling, and the roving-tabindex on `matches-tabs` are all genuinely good and I do not re-litigate them. What follows is where restraint tips into coldness, low affordance, jargon, or a broken keyboard path — and where the funnel that is supposed to _replace the consultancy_ still bounces a student out.

---

## P1 — The account gate is a single-provider funnel cliff

`components/auth/auth-card.tsx:39-63` renders exactly one working control: **Continue with Google**. The "Other ways to sign in →" disclosure reveals a dead line — _"Email sign-in isn't ready yet — Google is the only way to sign in for now."_ (`auth-card.tsx:60-62`).

Every consequence of the wizard depends on this one button:

| Surface | Depends on Google account? |
|---|---|
| Saving an anonymous assessment past 3 days | Yes — `startClaimOAuth` → `signInWithOAuth('google')` only |
| Any `(app)` route (dashboard, matches, plan, documents, guide, profile) | Yes — layout gate `redirect('/auth?…')` |
| Recovering results after sessionStorage is lost | Yes — Google claim is the _only_ path |

The product's stated north star is "replace the local consultancy," and the single biggest self-serve dead-end in the app is its own front door. A student without a Google account — or one whose institution/family uses a non-Google mail provider, or who is on a borrowed device where they will not sign into a personal Google account — completes nine screens of effort and then **cannot keep the result**. The conversion prompt (`conversion-prompt.tsx:50-58`) and `ConversionPaths` both offer _only_ "Continue with Google." This is founder-known, but it remains the highest-leverage journey break in the app: the wizard's entire purpose is to earn the account, and the account is reachable by one OAuth provider.

**Recommendation:** ship at minimum a magic-link email fallback before wide launch, or if that is genuinely out of scope, make the ceiling honest _up front_ — the landing CTA says "no account needed," which is true for the wizard but silently becomes "Google account required" the moment a student wants to keep anything. A student on a non-Google stack should learn that before investing nine screens, not after.

---

## P2 — Wizard keyboard flow and focus management are incomplete

`components/wizard/wizard.tsx` advances only through the `Continue →` / `See where I stand →` button `onClick`. There is:

- **No Enter-to-advance.** A keyboard user selects an option (a `<button role="radio">` in `option-card.tsx`), then must Tab past the callouts to reach Continue and press it — every screen, nine times. On a one-question-per-screen wizard this is the single most common interaction and it has the highest possible tab cost.
- **No focus move on step change** (`wizard.tsx:74-84`). When the step swaps (`key={w.stepKey}` remounts the subtree with `animate-slide-fwd`), focus stays on the now-relabeled Continue button. There is no `.focus()` on the new `<h1>` and no `aria-live` region announcing the new question. A screen-reader user hears nothing change; a keyboard user is dropped at the bottom of the new screen with the question above their focus point. (Confirmed: no `.focus()` / `autoFocus` anywhere in `components/wizard/`.)

The `ProgressDots` `role="progressbar"` (`progress-dots.tsx:9-14`) is correct, and the reduced-motion global (`globals.css:223`) and focus-visible ring (`globals.css:242`) are both properly in place — so the primitives are good; the wizard just does not drive focus or key events on top of them.

**Recommendation:** on `next()`/`back()`, move focus to the step heading (make the `StepShell` `<h1>` programmatically focusable, `tabIndex={-1}`), and handle Enter on the step container to trigger `handleNext` when the step is complete.

---

## P2 — The AI guide is invisible to screen readers

`components/guide/guide-chat.tsx:66-88`: the message list is a plain `<ol>` with no `aria-live`, the in-flight indicator _"The guide is thinking…"_ is a plain `<span>`, and only the **error** path carries `role="alert"` (`:85`). So a sighted user watches the assistant reply appear, but a screen-reader user gets **silence on success and an announcement only on failure** — the one time the guide works, it is unannounced; the one time it fails, it shouts. For a "grounded, trust-first" answer surface this inverts the priority.

**Recommendation:** wrap the message stream (or an appended-reply region) in `aria-live="polite"` and give the pending indicator `role="status"`. The textarea `aria-label` (`:96`) and the disabled-submit handling are already correct.

---

## P2 — No branded 404, and app-shell dead-ends fall through to Next's default

`find app -name not-found.tsx` returns **nothing**. Multiple real routes call `notFound()`:

- `/assessment/[id]` when an anonymous assessment is expired, claimed, or has an unguessable-but-wrong id
- `/checklist/[programId]` and `/destinations/[id]` on any unknown id

All of these render Next.js's **unstyled default 404** — outside the AppBar/Footer chrome, in a different typeface, with no "calm authority" and no route back into the funnel. The single most likely person to hit this is a student returning to a bookmarked results link **after the 3-day expiry** — exactly the anxious, high-intent moment the product most wants to catch. Instead they get a bare "404 | This page could not be found." with no CTA to re-assess.

Contrast this with how good the _segment_ boundaries are: `(app)/error.tsx` and `(marketing)/error.tsx` are calm, honest, and route-aware (the marketing one even withholds the "your data is safe" claim because an anon visitor has nothing saved — `error.tsx:12-14`). The `notFound()` path deserves the same care and currently has none.

**Recommendation:** add a root `app/not-found.tsx` (branded, with a "See where you stand" CTA) and ideally a group-level one for `(app)`. For the expired-assessment case specifically, a dedicated "this assessment expired — start a fresh one" page beats a generic 404.

---

## P2 — Jargon reaches the 19-year-old unglossed in places

The dataset layer is disciplined about expansion — `au-student-visa-requirements.ts:23` writes _"Confirmation of Enrolment (CoE)"_, and the `GenuineStudent` panel is titled _"The Genuine Student test (Australia)"_ (`genuine-student.tsx:27`) rather than "GS". But the discipline is uneven at the UI edges:

- **`outcome-self-report.tsx:16`** ships a tappable chip labelled **"I got my CoE"** with no expansion anywhere near it. This is a milestone button a first-time applicant taps; "CoE" is exactly the acronym they may not yet know.
- **`program-card.tsx:120-142`** stacks **"Provider CRICOS {code} · search the register"** and **"{level} evidence · Nepal"** as mono microcopy. Both have helpful `title` tooltips, but tooltips are hover-only (no touch, no keyboard-parity announcement), so on mobile — the primary device for this audience — the acronyms stand bare.
- **`cost-estimate-panel.tsx`** and matches surfaces use **OSHC** in headings; it is expanded in source comments but I could not confirm it is spelled out in the rendered heading on first use.

None of this is wrong data — it is a register mismatch: the copy occasionally addresses a migration agent, not a scared teenager. The founder's own memory notes ("copy precision in generators") flag this exact risk.

**Recommendation:** gloss every acronym on **first visible use per surface** (`CoE (Confirmation of Enrolment)`), and treat `title`-only tooltips as decoration, never as the sole explanation, given the mobile/touch audience.

---

## P3 — The first wizard screen is a non-choice

`components/wizard/steps/home-country-step.tsx:21-27` renders a `role="radiogroup"` containing **exactly one selectable `OptionCard` (Nepal)**, plus a static "coming soon" line. The very first screen of the funnel — the moment with the highest drop-off sensitivity — asks a question with one answer and still requires a tap to select it before Continue enables (`isStepComplete`). Meanwhile `homeCountry` is hard-coded to Nepal in scoring anyway (`from-sections.ts`), so the answer is cosmetic.

**Recommendation:** either pre-select Nepal (so Continue is immediately live and the screen reads as a confirmation, "You're applying from Nepal — more countries soon"), or fold it into the destination screen. Do not spend the funnel's most fragile screen on a forced non-decision.

---

## P3 — "9 quick questions" vs "Step 1 of 8"

Four surfaces promise **"9 quick questions"** (`page.tsx:40` and `:118`, `snapshot-card.tsx:20`, `destination-detail.tsx:94`). But `visibleStepsFor` (`use-wizard-state.ts:58-63`) filters the **gap** step out unless the student has a >2-year study gap, so the common path renders **8** steps and the counter reads _"Step 1 of 8"_. A trust-first product that markets on honesty should not open with a number the very next screen contradicts. Either count consistently (state "up to 9") or drop the number ("a few quick questions").

## P3 — A forced 2-second wait before results

`ProfileRecap` holds for a hard-coded `durationMs = 2000` (`profile-recap.tsx:65`) before advancing, gated as `max(API latency, 2s)`. The in-code rationale (honest confirmation, not fake "analyzing" theatre) is thoughtful and I respect the intent — but for an anxious student who just answered nine questions about their future, a mandatory 2s hold on a ready result is still 2s of imposed waiting. It is defensible; it is also worth an A/B look, because "calm" and "make me wait" are not the same thing. The recap also has no `aria-live`, so a screen-reader user experiences it as a silent 2s gap.

## P3 — Profile is hard to reach on mobile

`mobile-tab-bar.tsx:8-14` exposes five tabs; **Profile is not one of them** — it lives in the `UserPill` avatar menu. Profile is where a signed-in student improves their verdict and unlocks matches (the dashboard `PromptCard` even pushes them there — `prompt-card.tsx:100`). Burying the primary self-improvement surface behind an avatar menu on the primary device is a discoverability tax on the exact action the product wants to drive.

---

## Coherence & things that are right (kept brief, no padding)

- **Error boundaries are a model of honest, route-aware copy** — the marketing boundary deliberately withholds the "data is safe" claim for anonymous visitors (`(marketing)/error.tsx:12-14`).
- **Persist-miss recovery** (`conversion-prompt.tsx:27-43`, `assess-flow.tsx`) retries the save in place and never re-runs the wizard — genuinely considerate.
- **Reduced-motion, focus-visible rings, `role="progressbar"`, radio/checkbox roles on option cards, roving tabindex on match tabs** — the a11y _primitives_ are present and correct; the gaps above are all at the _orchestration_ layer (focus movement, live regions, skip link), not the components.
- **One real omission at the chrome level:** there is **no skip-to-content link** anywhere (`grep skip` across `app/` + `components/` is empty), so a keyboard user tabs through the full AppBar nav on every page load before reaching content.

---

## Priority order for the founder

1. **P1** — Give the account gate a non-Google fallback _or_ make the "Google required to save" ceiling honest before the wizard, not after. This is the funnel cliff.
2. **P2** — Wizard focus/Enter handling; guide `aria-live`; branded `not-found.tsx` (especially the expired-assessment return path); skip link. These are small, high-return keyboard/SR/return-visitor fixes.
3. **P2/P3** — Gloss CoE/CRICOS/OSHC/evidence-level on first visible use.
4. **P3** — Pre-select Nepal on step 1; reconcile "9 questions" with the "of 8" counter; reconsider the forced 2s recap; surface Profile on the mobile tab bar.
