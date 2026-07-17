# 2026-07-10 audit — verified build order (9 slices)

> **Provenance.** Generated 2026-07-17 by a 21-agent verification workflow (verify → adversarial
> recheck → synthesize) run against the live tree, NOT copied from the audit prose. All 10 findings
> re-verified STILL_LIVE at high confidence; 0 already fixed; 0 refuted. This file exists because
> the plan previously lived only in an agent context window and a temp file.

> **Read the corrections below before building any slice** — several audit findings are overstated
> or misdiagnosed, and following the report literally would produce a WRONG fix (C-5 especially:
> it would delete content the research brief says to keep permanently).

---

Verified against live code — all nine findings hold, plus one the audit missed. Here is the sequencing plan.

---

# Build slices — Nepal→Australia trust repair

**Verification notes before slicing:**
- `lib/matches/compute.ts` is 191 lines and **four findings touch it** (C-3, C-4-LayerB, C-10, C-5). Their line regions are disjoint (73–151 vs 153–182), so they can run in parallel with a trivial rebase — but they must not be one PR.
- **New contradiction found, not in the audit** (C-1c): `app/(marketing)/trust/page.tsx:41-44` claims uploaded documents are "used only to replace declared values with verified ones in your assessment." `reScoreAssessment` is called from `/api/assess`, `/api/assess/refresh`, and `/api/profile/section` — **never** from the upload route. Commit `fc380e2` ("uploads don't rescore") already fixed this exact claim on the accuracy meter and missed the trust page. Same paragraph as C-1, so it is free to fix in that slice.
- Confirmed: `WIZARD_STEPS` has 9 steps, no refusals; `lib/validation/profile.ts` has **no** `priorRefusals` key — so the zod-strip leg of F-1 is real.

---

## Slice 1 — Budget means tuition **plus** living costs
- **Closes:** C-3
- **Files:** `lib/matches/compute.ts` (73–99, 139–151), `lib/matches/types.ts` (scoreSnapshot), `lib/matches/from-sections.ts`, `lib/matches/from-student-profile.ts` + ~12 test files incl. `tests/matches/compute.test.ts`, `anon-equivalence.test.ts`, `tests/results/accuracy.test.ts`, `tests/integration/aarav.test.ts`
- **Effort:** M
- **Student-visible outcome:** A student with AUD 45,000 against a 45,000-tuition program stops reading "**Strong** · Budget covers AUD 45,000 tuition" and reads "Budget short by AUD 29,710 for tuition + living costs." The wizard asked for tuition+living; the verdict finally compares against tuition+living.
- **Risk if wrong:** Verdict *deflation at scale* — a large share of cards move Strong→Possible/Reach. If a fixer rewrites the 12 test goldens to match rather than reasoning about each, the suite ratifies whatever the new code does. Second risk: the fix touches the copy but leaves the `tuitionGap === 0` promotion at line 89, so cards still read "Strong" — the verdict condition is the load-bearing defect, the copy is the symptom. **Do not rename `tuitionGap`** — it is persisted untyped in `score_snapshot` on frozen MV-08 predictions; add `costGap` alongside.

## Slice 2 — Score the English band we actually claim
- **Closes:** F-3
- **Files:** `lib/scoring/profile-strength.ts`, `tests/scoring/english-test-type.test.ts`, `tests/scoring/profile-strength.test.ts`
- **Effort:** S
- **Student-visible outcome:** A PTE 58 taker (a very common Nepal path) stops being told "Strong English (58.0)" beside the words "High IELTS," and stops collecting a top-band bonus they did not earn. The results panel stops contradicting the visa panel, which already normalizes correctly.
- **Risk if wrong:** Low — `toIeltsEquivalent(score, undefined)` passes through unchanged, so IELTS goldens should not move. If they do, the normalizer is being applied twice. The label copy ("IELTS 7.5 equivalent") touches the standing copy-precision sensitivity.

## Slice 3 — Never destroy a document before validating its replacement
- **Closes:** C-8
- **Files:** `app/api/documents/upload/route.ts`, `lib/documents/repo.ts`, `tests/api/documents/upload.test.ts`
- **Effort:** S
- **Student-visible outcome:** Uploading a renamed HEIC over your passport scan returns "file contents do not match" and **leaves the passport scan intact**, instead of silently erasing it while the card still reads "Uploaded" until the next page load.
- **Risk if wrong:** The rollback path is the danger — a botched reorder that deletes the row then fails to insert loses the document *permanently*, which is worse than today. Use the `upsertDocument` variant (`onConflict: "owner,kind"`, the unique index already exists) so there is no delete-then-insert window at all, rather than the narrower step-3/4 sequence.

## Slice 4 — A match card's reasons must all be true
- **Closes:** C-10, C-5
- **Files:** `lib/matches/compute.ts` (153–182), `lib/matches/types.ts` (MatchReason kind), `app/(app)/matches/page.tsx`, `lib/results/assemble.ts`, `lib/results/types.ts`, `components/results/field-coverage-notice.tsx` (new), `components/wizard/steps/field-of-study-step.tsx`, `tests/matches/compute.test.ts`, `anon-equivalence.test.ts`, `tests/app/matches-page.test.tsx`
- **Effort:** M
- **Student-visible outcome:** A Law student (or anyone picking "other," which can *never* have catalogue coverage) stops seeing a page of nursing programs presented as their matches, and reads plainly that we don't list Law yet. Separately, every card's Nepal-AL3 line stops speaking in DHA's voice ("expected") and matches the PolicyBanner's approved recommendation voice — including on the **anonymous pre-signup results page**, which is where trust is won or lost.
- **Risk if wrong:** The two halves fail in opposite directions. C-10 risks *over*-disclosure — computing coverage from a hardcoded field list rather than the catalogue actually passed in would tell students we don't cover a field the live DB does carry (both probes ran against `SEED_PROGRAMS`, not `listAllPrograms(supabase)`). C-5 risks nothing but must not hard-filter creep in: **do not** convert the soft field sort to a hard filter — that trades a dishonest list for an empty page, which is the worse bounce.
- **Sequencing:** parts 1–2 must land in both callers together or `anon-equivalence.test.ts` breaks.

## Slice 5 — Unknown is not zero
- **Closes:** C-4 (Layer A only)
- **Files:** `lib/matches/sufficiency.ts` (new), `app/(app)/matches/page.tsx`, `lib/outcomes/freeze.ts`, `lib/plan/invalidate.ts`, `tests/matches/sufficiency.test.ts` (new), `tests/app/matches-page.test.tsx`, `tests/outcomes/freeze.test.ts`, `tests/plan/invalidate.test.ts`
- **Effort:** M
- **Student-visible outcome:** A student who signs in without the wizard and types only their name stops seeing every program silently banded **Reach** with "Grade short by 65%" computed off a field they never filled. They see the existing profile-incomplete prompt instead.
- **Risk if wrong:** *Over-gating.* A partially-filled profile that showed partial verdicts now shows a wall — and a wall is itself a bounce to a consultancy. The gate must key on the three verdict-driving inputs (grade, English, budget), not on profile completeness generally. Layer B (a real `unknown` band) is the follow-up that recovers partial value; do **not** bundle it — it needs a `MatchVerdict` union change and would collide head-on with Slice 1's lines 73–99.
- **Reachability caveat worth stating:** the modal wizard→claim path bootstraps the scored sections, so this bites the direct-sign-in path, not the primary funnel. That is why it sits below Slices 1–4.

## Slice 6 — Closed application windows read as closed
- **Closes:** F-19
- **Files:** `lib/data/select-scholarships.ts`, `lib/data/source/australia-awards-scholarship.ts`, `tests/data/select-scholarships.test.ts`, `tests/data/freshness.test.ts`, `tests/components/scholarships-panel.test.tsx`
- **Effort:** S
- **Student-visible outcome:** Under "Scholarships you may be able to apply for," the Australia Awards row stops saying "Applications open 1 Feb 2026, close 30 Apr 2026" in the present tense **78 days after the window shut**, and says the window closed with next-intake dates unpublished.
- **Risk if wrong:** Reading `new Date()` inside the selector makes the suite clock-dependent and self-expiring — the exact trap that produced this finding. Inject `today`. **Do not bump the dates forward**: the next intake's dates are unpublished and inventing them is the worse bug.

## Slice 7 — The trust page describes the system we actually built *(founder-gated)*
- **Closes:** C-1/C-2, plus **C-1c** (the uploads-rescore claim found above)
- **Files:** `app/(marketing)/trust/page.tsx`, `tests/marketing/trust-page.test.tsx` (new), `components/guide/guide-chat.tsx`, `lib/account/owned-tables.ts` (lift), `app/api/account/delete/route.ts`
- **Effort:** S
- **Student-visible outcome:** The trust page of a trust-first product stops making three false statements: that data goes to no third parties (DeepSeek + PostHog), that assessments are retained 12 months after deletion (no such mechanism exists), and that uploads verify your assessment (they don't rescore). The claims that *are* true and are the page's real value — no selling, no lead-gen, no commission — survive and get stronger by standing next to specifics.
- **Risk if wrong:** Under-disclosure is a legal exposure; over-disclosure ("we send your documents to DeepSeek") is false in the *other* direction and worse — `lib/guide/context.ts:14-16` confirms name, email, documents, and numeric scores never leave. Lift `OWNED_TABLES` so the copy/code coupling is machine-checked, or this drifts again.

## Slice 8 — Accuracy meter stops promising a ladder that doesn't exist *(founder-gated)*
- **Closes:** C-6
- **Files:** `lib/results/accuracy.ts`, `components/results/accuracy-meter.tsx`, `tests/results/accuracy.test.ts`, `tests/results/assemble.test.ts`, `tests/components/results/accuracy-meter.test.tsx`
- **Effort:** S
- **Student-visible outcome:** The meter stops heading three suggestions with "Make your assessment more complete:" above a bar mathematically capped at 28 — where 40 ("Verified") and 75 ("Complete") are unreachable and two of the three suggestions openly admit they only "keep it on file."
- **Risk if wrong:** Any fix that re-weights thresholds but leaves the heading and suggestion list alone still ships a misleading meter. If Option 1 is chosen, **do not** count `alsoConsidering` or `secondaryGoals` — both are documented scoring-inert and guarded by `tests/scoring/secondary-goals-inert.test.ts`; counting them re-earns the same dishonesty. Existing `assessments.result` rows keep stale `level: "Basic"` until `reScoreAssessment` next runs.

## Slice 9 — Ask about prior refusals before predicting on them *(founder-gated)*
- **Closes:** F-1
- **Files:** `components/wizard/use-wizard-state.ts`, `components/wizard/steps/refusals-step.tsx` (new), `components/wizard/wizard.tsx`, `components/wizard/step-meta.ts`, `lib/validation/profile.ts`, `lib/profiles/from-assessment.ts`
- **Effort:** M
- **Student-visible outcome:** A student with a prior visa refusal stops getting an optimistic anonymous verdict that **silently drops a band** the moment they honestly declare it in the profile editor. The app stops rewarding a stable verdict through sign-in and then punishing exactly the students who volunteer adverse information.
- **Risk if wrong:** Steps 5 and 6 are **not optional and have no typecheck guard**. Skip the zod key and the server strips the answer at `/api/assess` — wizard asks, server discards, bug fully intact behind a UI that looks fixed. Skip the `from-assessment` mapping and claim-time bootstrap drops it, so the signed-in re-score silently *raises* the verdict — the exact mirror-image of the reported bug. Funnel risk: a 10th step costs completion.

---

## Ordering rationale (one clause each)

| # | Slice | Why here |
|---|---|---|
| 1 | Budget + living | wrong verdicts at scale on the money question students actually come to ask, and "Strong" to an under-funded student is precisely the false hope a consultancy sells |
| 2 | English normalization | S effort against a false label plus an unearned bonus for every PTE taker, a very common Nepal path |
| 3 | Upload atomicity | S effort against silent destruction of a stored document that the UI then lies about |
| 4 | Reason honesty | M, but it is the only slice fixing two live honesty breaks on the **anonymous pre-signup page**, where trust is decided |
| 5 | Unknown ≠ zero | total fabrication when hit, but reachable mainly on the direct-sign-in path since the modal funnel bootstraps |
| 6 | Closed windows | S, adjudicated P1 — present tense misleads but the rendered year lets an attentive reader infer it |
| 7 | Trust page | S build, but a published false statement gated on a founder legal call, so lead time not effort sets its place |
| 8 | Accuracy meter | S, misleading but carries no verdict harm, and the shape is a product call |
| 9 | Wizard refusals | M plus a funnel decision, narrowest reachability (needs a real refusal *and* a voluntary editor visit) |

**Parallelism:** Slices 1, 4, and 5 can run concurrently — line regions in `compute.ts` (73–151 vs 153–182) and `types.ts` (scoreSnapshot vs MatchReason) are disjoint, and Slice 5 doesn't touch `compute.ts` at all. Only `tests/matches/compute.test.ts` and `anon-equivalence.test.ts` collide; land Slice 1 first and rebase. Slices 2, 3, 6 are fully isolated and can go anytime.

**Live-browser pass required** (per the jsdom-blind rule) on Slices 1, 4, 6, 8 — all four make cross-page consistency claims that a green jsdom suite cannot see.

---

## Founder decisions required — agents cannot proceed without these

**Hard blockers (the decision changes the implementation, not just the wording):**

1. **C-6 / Slice 8 — Option 1 or Option 2?** Build the ladder real (English/refusals/dependents each +25, thresholds 40/75 become reachable) **or** delete the 3-state tier union and keep only the honest suggestion list. *Context that reframes this:* the design spec at `docs/superpowers/specs/2026-06-02-onboarding-mvp-design.md:211` literally specifies "Profile completeness: 28% | Assessment accuracy: Basic" — so 25/28→Basic is the **intended** state and Verified/Complete are aspirational branches for capability that was never built. This is "dead thresholds for an unbuilt feature," not an arithmetic bug. Two sub-questions: do you want the levers built, and are you willing for old assessments to read Basic until touched?

2. **C-1/C-2 / Slice 7 — does 12-month retention exist?** Either (a) it does not, and the sentence is deleted (minimal honest fix, aligns the page with the route that hard-deletes), or (b) you want it, and it is a separate build — archive table + purge job + migration — and must not be claimed until it exists. **Plus:** approve the processor-disclosure wording naming Supabase, DeepSeek, and PostHog, and exactly what each sees. An agent must not unilaterally rewrite published privacy copy.

3. **F-1 / Slice 9 — a 10th wizard step, or disclosure-only?** Full fix: ask about refusals (one tap, defaults to "none"), which makes the anonymous verdict correct. Fallback: leave 9 steps and disclose on results that the estimate assumes no prior refusals — this converts a *silent* honesty break into a *disclosed* one but does **not** make the verdict correct. Also needs your eye on the no-shame framing of asking a student about visa refusals.

4. **F-19 / Slice 6 part 1 — the `reverifyBy` date.** Needs a DFAT check on when the next Australia Awards intake round is expected. Parts 2+3 (closed-aware rendering + the freshness guard) are pure code and ship without you.

**Soft — build proceeds, you confirm at review:**

5. **C-3 / Slice 1 — verdict deflation heads-up.** Correcting this moves many cards Strong→Possible/Reach. Not a blocker (the honest verdict is the honest verdict), but it is a large product-visible shift and you should not first learn about it from the diff.

6. **C-10 / Slice 4 — the data alternative.** The honest fix is a UI/trust fix; the **root cause is catalogue coverage**. Seeding real Law/arts/hospitality/agriculture programs would remove the case entirely for those fields. "Other" can never be covered, so the notice path is needed regardless — but this is a data decision that changes how much the notice ever fires.

7. **F-3 / Slice 2 — label convention.** `Strong English (IELTS 7.5)` vs `Strong English (IELTS 7.5 equivalent)` for non-IELTS takers. Minor, but the standing copy-precision sensitivity says ask.
