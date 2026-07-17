# MVP Definition — What Must Ship Before Real Nepali Students Arrive

*Audit section · 2026-07-10 · adversarial founder-advisor lens · north star = student outcome, not coverage*

## The one-sentence honest read

LandingPad is **past-MVP in breadth and pre-MVP in launch-readiness.** Nine surfaces, ~1,900 tests, a versioned scoring engine, and a sourced dataset are built — but real users should not be promoted to the current product yet. There is no published privacy policy or terms, the app accepts sensitive uploads without the drafted collection/consent flow, the self-reported age field can include minors without a guardian gate, and several high-stakes claims contradict implementation. Legal disclosure and decision correctness are joint launch blockers.

The founder's instinct that the app is "broad but shallow" is correct, but the shallowness that matters for launch is not "the student can't APPLY through it" — it is **the absence of the boring launch-hygiene layer** (legal pages, error monitoring, a human fallback, a settled name) that turns a good demo into a shippable product.

## Is launch blocked by product, data, legal, or distribution?

Ranked by what actually stops a launch:

| Blocker class | Status | Verdict |
|---|---|---|
| **Legal** | `/privacy` + `/terms` do NOT exist; footer has no legal links (`components/layout/footer.tsx` COLS = Product + Trust only); MV-05 `col:"blocked"` on founder | **HARD BLOCKER** |
| **Distribution / brand** | Name unsettled: footer says "© 2026 MyVisa", email is `support@merovisa.app`, task brief calls it "LandingPad", rebrand in flight | **HARD BLOCKER** (can't market an un-named product) |
| **Product depth** | Student can assess + plan + organize docs, but cannot submit an application. Honest scope, but framing gap vs "replaces the consultancy" | **SOFT — reframe, don't build** |
| **Data completeness** | Nepal→AU corridor seeded, sourced, freshness-guarded. Sufficient for one corridor | **NOT a blocker** |
| **Operational readiness** | No Sentry wired; no error monitoring; no human fallback; guide single-provider | **SOFT BLOCKER — fix before real traffic** |

Launch is **not** blocked by product gaps or data — those are good enough for a Nepal→AU beta. It is blocked by **legal + brand**, and it is *unsafe* to launch without **operational readiness**.

---

## Findings

### P0 — No privacy policy or terms of service exists, yet the app collects sensitive minor-adjacent data
`/privacy` and `/terms` return 404. The footer (`components/layout/footer.tsx:6-22`) links only to product/trust marketing. Meanwhile the product stores grades, funding source, dependants, immigration history, and potentially passports/bank statements. It records age rather than DOB; the allowed range includes minors, but no guardian gate is implemented. MV-05 has a working disclaimer and deletion path, and a copy packet exists, but legal identity/jurisdiction/hosting facts and collection/consent decisions remain unresolved. **This must ship before public promotion or sensitive uploads.**

### P0 — Google OAuth is the only account path; a student without a Google account has no way in
`components/auth/auth-card.tsx:61`: *"Email sign-in isn't ready yet — Google is the only way to sign in for now."* Every durable-value action — saving an assessment, converting before the 3-day expiry, reaching any `(app)` route — requires a Google account. In Nepal, Android/Google penetration is high, so this is *less* catastrophic than it reads, which is why I weight the practical risk as P0-borderline-P1. But it remains a hard, single-vendor funnel dependency with no fallback: a student on a shared/feature phone, or one whose Google login fails, hits a wall on the highest-intent screen in the app. At minimum, magic-link email must be the fast-follow. **Ship a second auth path before scaling distribution.**

### P1 — The 3-day expiry is a silent data-loss trap: no email delivery, no reminder, no anonymous retrieval
There is **no email capability anywhere in the product** (`grep resend|nodemailer|sendgrid|postmark` → empty). Anonymous results live in `sessionStorage` and a server row recoverable only by unguessable id while unclaimed AND unexpired. The copy is honest about this (`components/results/conversion-paths.tsx:51`, `gated-teasers.tsx:5-6`: *"there is no email-delivery or anonymous-retrieval path, so we don't imply one"*) — but honesty about a data-loss trap does not remove the trap. A student who completes the wizard, closes the tab, and returns on day 4 has **lost everything** with no notification. The 3-day expiry is pitched as a conversion driver; without any reminder channel it is equally a **conversion killer and a trust wound.** The fix is not "remove expiry" — it is "add one email touch" (deliver-a-copy + a day-2 reminder), which also unblocks the auth fallback above.

### P1 — Product identity is unsettled: three different names ship in production
`components/layout/footer.tsx:58` renders "© 2026 MyVisa"; the support email is `@merovisa.app`; the audit brief calls it "LandingPad"; CLAUDE.md says "MyVisa". A product cannot be marketed, cannot own a domain, cannot print a privacy policy entity, and cannot build word-of-mouth in Kathmandu consultancy-replacement circles **without one decided name and an owned domain.** The rebrand (name + ringtail mascot) is "in flight" — but it is a **launch gate**, not a polish item, because the privacy policy (P0 above) needs the legal entity/name to exist first. These two blockers are coupled: **decide the name → register entity + domain → publish legal pages.**

### P1 — No human fallback: every self-serve dead-end bounces to nowhere
The north star is "every self-serve dead-end is a bounce to a consultancy." The app has *several* dead-ends and **none of them offer a human:** unsupported destination → `UnsupportedDestinationNotice` ("we don't cover this yet"); guide provider down → calm 503; no-Google-account → hard stop; expired assessment → `notFound()`. The only human channel is a `mailto:support@merovisa.app` buried in `/trust`. Ironically, the product built to stop students bouncing to consultancies gives a stuck student **no path forward at all** — which sends them straight back to the consultancy the app exists to replace. A single "stuck? tell us where — we'll help" contact affordance on every dead-end (and a waitlist capture on unsupported corridors) converts dead-ends into leads. **Cheap, high-impact, ship before launch.**

### P1 — No error monitoring in production (Sentry documented but not wired)
`SENTRY_DSN` is in `.env.example` and Sentry is listed in the CLAUDE.md stack, but there is **no `@sentry/*` dependency and no instrumentation** (per quality-ops ground truth; confirmed no `instrumentation.ts`). Launching to real, unmonitored users means the first you hear of a broken OAuth callback or a scoring crash is a student complaint — or silence. For a trust-first product, a silent production error is a trust breach you can't even see. **Wire Sentry (or any error sink) before real traffic.** This is hours of work, not a feature.

### P2 — The app does not let a student APPLY — reframe the north star, don't over-build
The plan generator hands the student external action steps — `submit-apps`, `accept-offer`, `get-CoE`, `arrange-OSHC`, `lodge-subclass-500`, `verify-agent-marn` (`lib/plan/generator.ts:298-337`) — but the app **performs none of them.** A real consultancy *does the application for you*; LandingPad tells you what to do and organizes your documents. This is a legitimate and defensible MVP scope (assessment + guidance + document organization), but the "replaces the consultancy" framing over-promises. **Recommendation: do NOT build an application-submission portal for MVP** (it multiplies legal/liability surface and provider-integration cost). Instead, sharpen the promise to "know your real chances and exactly what to do — before you pay a consultancy," which the app *does* deliver.

### P2 — Uploads don't change the verdict — a latent expectation gap the docs pre-empt but the product surface may not
`/how` is admirably honest (`app/(marketing)/how/page.tsx:77-81`): uploading an IELTS/transcript/bank statement "keeps your documents organized… doesn't change your verdict or match scores." Good. But a student who uploads a bank statement into a "documents vault" on a product that scored their *financial capacity* will reasonably expect the two to connect. The honesty is buried on a methodology page, not at the upload surface. **Verify the `/documents` UI itself carries the "this organizes, it doesn't re-score" line** (low effort, closes the trust gap at the point of expectation).

### P2 — Outcome capture is live; verification and calibration are not
MV-08 writes self-reported data end-to-end: marking a program Applied freezes its prediction, creates an application attempt, and the dashboard/API can add offer, visa, and enrolment events. The missing half is an evidence-verification/admin path, explicit consent for calibration use, cohort thresholds, and calibrated reporting. This is not a controlled-beta blocker, but the product must not call the verdict “real chances” until this loop has reliable data.

### P3 — Guide is single-provider (DeepSeek); degrades to 503 with no fallback
`lib/guide/deepseek.ts` throws on missing/failed key; route returns calm 503. Live in prod per project memory. Acceptable for MVP, but a single external dependency for the "AI guide" pillar. Not a launch blocker; note for reliability roadmap.

---

## What to ship / defer / never build

| Ship before launch (blockers) | Defer (post-launch, safe) | Never build (for MVP) |
|---|---|---|
| Fix privacy/AI/deletion/document claims so copy matches behavior | Verified outcome ingestion + calibration | Percentage “visa odds” without calibrated, verified outcome data |
| Fix budget-vs-tuition math and missing-as-zero matches | Consented OCR/extraction with a review step | Pay-to-rank or hidden sponsored recommendations |
| Remove/qualify unsupported 6-month bank-seasoning rule | Second/third destination corridors | Unlicensed immigration advice or GS/SOP ghostwriting |
| Decide name + register entity + own domain | Genuine Student preparation workspace | Application-submission portal (do-it-for-you) |
| Publish `/privacy` + `/terms` (unblock MV-05) | Scholarships dataset (MV-55) | Automatic OCR-to-verdict changes without user review |
| Email: deliver-a-copy + day-2 expiry reminder | Mascot/brand-character full rollout | In-app payments / consultancy marketplace |
| Magic-link auth fallback (non-Google) | Outcome verification/admin workflow (capture is live) | Notification push infra beyond email |
| Wire Sentry (or any error monitor) | Mirrored visa-prep rows polish (MV-27) | Native mobile app |
| "Stuck? talk to us" fallback on every dead-end | Cost/scholarship tab depth | Streaks / gamification (per design memory) |

**Biggest impact for least effort:** the *email touch* (P1) is the highest-leverage single build — it simultaneously (a) rescues the 3-day expiry from being a data-loss trap, (b) provides the reminder that drives conversion, (c) creates a non-Google recovery channel, and (d) becomes the human-fallback delivery mechanism. One capability closes four findings.

---

## The "ship it" checklist (checkable launch criteria)

1. [ ] **Name decided**, legal entity registered, production domain owned; footer/email/OG all read one consistent name (today: footer="MyVisa", email="merovisa.app" — mismatch).
2. [ ] **`/privacy` and `/terms` published** and linked in the footer; age/guardian-consent handling decided (MV-05 founder gate closed).
3. [ ] **All P0 truth/correctness defects closed:** AI/data-sharing disclosure, deletion/retention, document-verification copy, budget math, missing-as-zero matches, unsupported seasoning claim, PTE/TOEFL inputs, and OAuth-error recovery.
4. [ ] **A second auth path** (magic-link email) live, so a no-Google student can save results.
5. [ ] **Assessment delivered by email** on completion + one **day-2 reminder** before the chosen expiry.
6. [ ] **Error monitoring wired** (Sentry or equivalent) and verified firing on a forced error.
7. [ ] **Human-fallback affordance** on all four dead-ends (unsupported destination, guide 503, expired assessment, no-account) + waitlist capture for non-AU corridors.
8. [ ] **`/documents` upload surface** carries the "organizes, doesn't re-score" line at the point of upload, and replacement is non-destructive on failure.
9. [ ] **One canonical "do X first" funnel** so `/guide` and `/checklist` don't give softer nudges than `/matches`/`/dashboard` for an incomplete profile.
10. [ ] **Green gate confirmed on `master`** (typecheck + lint + `npm test` + build) at the launch commit — the enforcing `validate` job, not the advisory integration job.

## First success metric worth instrumenting

**Primary: anonymous-results → claimed-account conversion rate** (the only durable-value event; it is what the entire funnel and the 3-day expiry exist to drive). Today the event catalog (`lib/analytics/events.ts`) has `wizard_completed`, `assessment_viewed{mode}`, `gate_cta_clicked`, and `signed_in` — but **no explicit `assessment_claimed` event.** `signed_in` fires on *every* first authed page mount (returning users included), so it cannot isolate the anonymous→claim conversion. **Action: add an `assessment_claimed` event fired in `app/auth/callback/route.ts` on successful `claimAndBootstrapProfile`, then instrument the funnel `wizard_completed → assessment_viewed(anonymous) → gate_cta_clicked → assessment_claimed`.** That ratio is the honest MVP heartbeat.

**Second, once launched: verified verdict-vs-reality calibration.** Self-reported outcome writes already exist. The next job is consented verification, clear admission-versus-visa gates, sufficient cohorts, and reporting that never converts tiny or biased samples into personal “odds.”
