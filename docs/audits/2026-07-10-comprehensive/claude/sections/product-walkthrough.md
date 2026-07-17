# Product Walkthrough — Nepali Student Personas (Aarav & Priya)

**Auditor stance:** former Kathmandu student who did the Nepal→Australia journey, now a UX researcher. I walked every screen against the real code. Two personas:

- **Aarav**, 19, +2 science ~3.4 GPA, family funds via land sale + bank loan, IELTS not yet taken. The app's ideal user.
- **Priya**, 24, two gap years, **one prior visa refusal**, self-funded. The anxious, high-risk user the app most needs to earn trust from.

Verdict up front: the happy path for Aarav is genuinely good — calm, honest, sourced. But the app quietly breaks its central promise ("an honest answer") for Priya, has one hard funnel dead-end, and gives neither persona a single reason to come back next week. Details below, grounded in code.

---

## Screen-by-screen

### 1. Landing (`app/(marketing)/page.tsx`)
Strong. Hero copy "An honest answer before you pay anyone" (`page.tsx:35`) and "9 quick questions · no account needed" (`:40`) is exactly the anti-consultancy hook a Nepali student is primed for — we are trained to distrust the agent who quotes fees from memory, and the freshness section ("the numbers a consultancy quotes from memory carry their origin and a verified date," `:105`) lands. I'd click "Check your eligibility."

Weakness: every promise on this page is about *assessment*, none about *ongoing relationship*. A consultancy's real hold on a student is that they're there for the whole year. The landing sells a one-time verdict.

### 2. Wizard `/assess` (`components/wizard/wizard.tsx`, 9 steps)
Clean. One question per screen, `ProgressDots`, contextual `InlineCallout`s. For **Aarav** the callouts are the best part of the product:
- English step: choosing "Not taken" surfaces "Until you test, we'll assume a provisional IELTS 6.0" (`english-step.tsx:89`) and a callout offering British Council Kathmandu test dates (`lib/callouts/rules.ts:66-68`). This *directly addresses English-test anxiety* — it tells the scared 19-year-old "not testing yet is fine, here's where to book." Excellent.
- Gap step: "A gap is normal — most applicants have one" (`gap-step.tsx:30`) pre-empts the parental-pressure shame. Good.

**P0 — Priya's prior refusal is never asked.** The 9 wizard steps are `homeCountry, education, fieldOfStudy, graduationYear, gap, english, destination, budget, goal` (`wizard.tsx:23-33`). There is **no refusal question** (grep for `priorRefusals` in `components/wizard` returns nothing). Yet the visa scorer applies a hard penalty for refusals (`REFUSAL_VISA_PENALTY` −15 one / −35 multiple, in `lib/scoring/visa.ts`). So Priya — whose refusal is the single biggest fact about her case — gets an anonymous verdict computed **as if she never had one.** The app that promises "an honest answer before you pay anyone" gives its most anxious user a *dishonestly optimistic* one. This is the exact opposite of the founder's north star.

It gets worse on sign-in. `lib/scoring/from-sections.ts:60` reads `priorRefusals: sections.immigration?.refusals`, and `lib/assessments/re-score.ts` recomputes. So the sequence for Priya is: anonymous "Possible" → she trusts it, creates an account → fills the immigration profile section → **her verdict silently drops to "Reach."** A trust-first product just did a bait-and-switch to the one cohort that already expects to be misled. (Note: I verified the sibling risk about *dependents* is now **stale** — `budget-step.tsx:65-77` DOES collect dependents post-MV-97. Refusals remain uncollected.)

**P2 — the `goal` step is theater.** The last-but-one step asks the student's dream (PR, employment, research, lowest-cost…). But `goal` is scoring-inert AND plan-inert — it only reorders matches and adds a framing note (`lib/matches/preference.ts`, `lib/goals/conflicts.ts`; enforced by `tests/scoring/*-inert.test.ts`). A student who says "I'm doing this for PR" gets the identical plan to everyone else. Emotionally: you asked me my reason for uprooting my life and did nothing with it.

**P2 — destination dead-end after full effort.** Pick anything but Australia and you still answer all 9 steps, then Results short-circuits to `UnsupportedDestinationNotice` (`results.tsx:65-71`). Honest, but the wizard knew at step 7 (`destination`) that it couldn't help — making the student finish budget + goal first is a small cruelty. Gate earlier.

### 3. Results (`components/results/results.tsx`)
For Aarav this is the emotional peak and it's handled with care: banded verdict, never a percentage (`:76`), four factor bars, sourced cost-to-apply, and — crucially — a collapsed "Know before you go" disclosure holding `RefusalRecovery`, `GenuineStudent`, `WorkingWithAgents` (`:116-133`), all government-sourced, none gated. The refusal-recovery panel is genuinely the emotional heart of the product: it addresses fear-of-refusal head-on with sector odds and recovery paths.

**P2 — but it's collapsed by default.** The one panel that speaks to Priya's deepest fear sits behind a folded `<Disclosure>`. The anxious user who most needs "here's what refusal actually means and how people recover" has to know to expand a reference accordion to find it. The calm-authority restraint here costs the app its most reassuring moment.

**P2 — matches are gated for the anonymous user.** `UniversityMatches` renders `unlocked={owned}` (`:101-106`) — Aarav sees blurred `GatedTeasers` peeking through. This is deliberate conversion pressure, and defensible, but combined with everything below it means the *first* verdict a student can actually act on requires an account.

### 4. The 3-day expiry + conversion (`components/results/conversion-paths.tsx`)
"Your assessment expires in 3 days" (`conversion-paths.tsx:57`). The only recovery is a Google account claim — the code is explicit and honest that no email-delivery/anonymous-retrieval path exists (`:51`). Two problems:

**P1 — 3 days is punitive for the actual decision timeline.** A Nepali student does not decide alone. This verdict goes home to parents, to a mama/kaka who paid for a cousin's Australia visa, maybe to a village elder — that conversation takes a week or two, not 72 hours. The 3-day clock is tuned for *conversion urgency*, not *student reality*. When it lapses, the results are gone irrecoverably (`getRecoverableAssessment` requires unclaimed AND unexpired). The student re-does the wizard or, more likely, gives up and walks into a consultancy. The urgency driver actively causes the bounce the app exists to prevent.

**P1 — Google-only sign-in is a hard funnel wall.** `auth-card.tsx` offers *only* "Continue with Google"; "Other ways to sign in" reveals "Email sign-in isn't ready yet — Google is the only way to sign in for now" (`:60-62`). Most Nepali students have a Gmail (Android is dominant), so this isn't universal breakage — but the segment that uses Facebook-login or a non-Google email literally **cannot save, cannot convert, cannot reach any signed-in screen.** For those students the entire journey past Results is a locked door, and a locked door in a trust-first funnel is a direct bounce to a consultancy. There is no email-magic-link fallback despite the schema (`leads` table) existing.

### 5. Dashboard (`app/(app)/dashboard/page.tsx`)
Once converted, this is competent: `Greeting`, `JourneyRail`, `SnapshotCard`, a `PromptCard` next-step brain (`pickPrompt`, `:33-39`), `ReadinessMap`, and an `OutcomeFunnel` that only appears after an application attempt. The "one next step" framing (`selectNextStep`) is the right anti-overwhelm move.

**P1 — nothing here is time-fresh enough to pull a weekly return.** The dashboard is a mirror of state the student already entered. `partOfDay()` changes the greeting; nothing else changes unless *the student* acts. There is no "3 universities updated their fees," no "your IELTS-booking reminder," no new content. Combined with the total absence of email/push (grep confirms no notification path anywhere), the app has **zero re-engagement loop.** The founder wants to replace the consultancy — but the consultancy's power is the weekly phone call. This app has no phone call. A student converts, sees their plan, and has no reason to open the tab tomorrow, let alone next week.

### 6. Profile (13 sections), Matches, Plan, Checklist, Documents
- **Profile** is thorough (`CompletenessRing` + accordions). The immigration section is where Priya finally discloses her refusal — and where her verdict silently changes (see P0 above). There is no interstitial warning that editing this section will move her verdict; it just changes.
- **Matches** gates an empty profile to a `PromptCard` rather than fabricating verdicts off zeroed inputs (`app/(app)/matches`) — good, honest.
- **Plan** is phase-grouped, "one step live at a time" — but as noted, identical regardless of `goal`.
- **Documents / Checklist:** **P2 — expectation gap.** `/how` states plainly "uploading doesn't change your verdict or match scores on its own" (`how/page.tsx:80-81`). Honest, but from the student's chair the vault is *filing, not progress*. Aarav uploads his IELTS scorecard expecting his standing to improve and… nothing moves. The one place a student produces real evidence is the one place the app is inert. This is the single biggest "why am I doing this" risk in the signed-in shell.

### 7. Guide (`app/(app)/guide/page.tsx`, `components/guide/guide-chat.tsx`)
The grounded guide is the app's most differentiated asset — "Ask the awkward questions you'd hesitate to ask an agent" (landing `:91`). Failure handling is honest (calm error, never a fabricated fallback, `guide-chat.tsx:10`).

**P2 — but the landing oversells access.** The guide requires sign-in AND is only grounded with an assessment (`guide/page.tsx:12,28-37`). The anonymous student the landing invites to "ask the awkward questions" is redirected to `/auth` before asking anything. The awkward-questions promise is paywalled behind the same Google door.

---

## Emotional journey scorecard

| Fear / pressure | Addressed? | Where |
|---|---|---|
| English-test anxiety | **Yes, well** | Provisional 6.0 + British Council Kathmandu link (`rules.ts:66`) |
| Gap-year shame | **Yes** | "A gap is normal — most applicants have one" (`gap-step.tsx:30`) |
| Fear of refusal | **Partially** | `RefusalRecovery` panel exists but collapsed by default (`results.tsx:116`) |
| Consultancy distrust | **Yes** | "no agents calling you," sourced-and-dated framing throughout |
| Prior-refusal honesty | **No — actively mishandled** | Refusal uncollected anonymously → verdict whiplash on sign-in (P0) |
| Parental pressure / family decision | **No** | No "share with parents" export; 3-day clock ignores the family-consultation timeline |

## Does anything drive a weekly return?
**No.** There is no email, no push, no reminder, no scheduled freshness digest surfaced to the user (grep: no notification path). The only urgency is the 3-day pre-conversion expiry, which is a *one-time* stick, not a recurring pull. After conversion the dashboard is a static mirror. For a product whose thesis is "replace the ongoing consultancy relationship," the missing re-engagement loop is the strategic gap beneath all the tactical ones.

## What would make me recommend it to friends
The honesty and the sourced numbers — *if* the verdict were actually honest for the refusal cohort. Right now I'd hesitate to send my cousin-with-a-refusal here, because it would tell her she's fine and then take it back. Fix the refusal question and I'd send everyone.
