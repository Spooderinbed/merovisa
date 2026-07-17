# Roadmap Audit — LandingPad (MeroVisa)

**Date:** 2026-07-10 · **Auditor role:** Head of product prioritization
**North star under test:** the app *replaces the local consultancy* — every self-serve dead-end is a bounce back to a consultancy. Steer by student outcome (journey completeness + reliability), not coverage %.

## TL;DR

The roadmap's remaining work is badly misordered against the north star. The single biggest, most journey-breaking gap — **a student without a Google account cannot sign in, save an assessment, or reach any signed-in surface** — is not on the board at all, while **three P1 cards (MV-85/86/87) are spent on a decorative mascot** for a product whose own design law makes the body imageless. Two "Blocked" cards are not actually blocked (MV-55 is founder-choice; MV-05 is gated on four facts the founder can supply in an email). The board itself is stale: two "In Review" cards (MV-99, MV-101) already shipped to production.

---

## 0. Board hygiene first — the board lies

**[P2] The board is stale and structurally unsafe.** `board.json` carries `"updated":"2026-07-03"`, but git HEAD is `d7347e3` (2026-07-09) with twelve PRs merged since. Concretely:

- **MV-99 and MV-101 are marked `inreview` but already shipped to master.** I verified the code is on HEAD: `components/layout/mobile-tab-bar.tsx:42` has the plum accent bar, `components/layout/logo.tsx:5` has `hover:opacity-80`, the five scaffold SVGs are deleted (`ls public/*.svg` → none), and `components/profile/completeness-ring.tsx:11` has `animate-rise`. Commit `4efb379` ("MV-101 chrome + cleanup") is in HEAD's history. These two cards are **Done**, not In Review.
- **Duplicate card IDs.** MV-99, MV-100, MV-101 each appear twice with different titles/columns (`MV-99-profile-restyle` vs `MV-99-step4-multi-subject`). Any by-ID lookup or dedup-union silently drops a card — a latent data-integrity bug already flagged in project memory. This must be fixed (suffix the IDs, e.g. MV-99a/MV-99b) before the board can be trusted for planning.

**Move:** regenerate the board, move MV-99/MV-101 → Done, disambiguate the collided IDs. This is a 10-minute chore that unblocks honest planning. After it, the *real* open set is: 3 Blocked (MV-05, MV-08, MV-55) + 7 Backlog (MV-27, MV-38, MV-48, MV-49, MV-50, MV-85, MV-86, MV-87).

---

## 1. The biggest gap is missing entirely: the Google-only auth dead-end

**[P0] There is no account path for a student without a Google account, and no card to fix it.** `components/auth/auth-card.tsx` offers Google OAuth only; the "other ways to sign in" reveal states *"Email sign-in isn't ready yet — Google is the only way to sign in for now."* Every conversion, every claim of an anonymous assessment, and every (app) route funnels through `startClaimOAuth` → `signInWithOAuth(google)`. A Nepali student on a shared PC, or one who uses a non-Google mail provider, completes the 9-step wizard, sees a verdict, and then **hits a hard wall at the exact moment the product is supposed to replace the consultancy**. The 3-day expiry then destroys the anonymous assessment (recoverable only by claiming before expiry). This is the textbook "self-serve dead-end = bounce to a consultancy" the north star exists to kill, and it is nowhere on the roadmap.

This is not a hard problem. Supabase Auth ships email OTP / magic-link out of the box, and the HMAC claim flow (`lib/auth/hmac-claim.ts`, `app/auth/callback/route.ts`) is auth-provider-agnostic — it binds by `userId`, not by Google identity. The blocker is a product decision (magic-link vs OTP, and the D1 minor-DOB capture, see §2), not engineering depth.

**Move: create a P0 card "Non-Google account path (email OTP/magic-link)" and build it before any mascot or polish work.** Nothing else on the board moves as many students across the conversion line.

---

## 2. Blocked cards — are they really blocked?

### MV-05 Legal / disclaimer — **[P1] gated on four facts, not on a lawyer**

The engineering is done and merged (`46752f3`): the not-advice disclaimer is live on results/dashboard/matches/plan, and the right-to-delete path works (`POST /api/account/delete`). The founder has already **decided D1 (16+ self-serve, guardian-gated under-16, DOB at sign-up)** and **D2 (retain until deletion)**. The *only* remaining external blocker is **D3: legal entity name + contact email + governing-law jurisdiction + Vercel region** — four facts the founder can supply in one message. The Codex-reviewed copy packet for `/privacy` + `/terms` is already drafted (`docs/legal/2026-06-20-mv-05-legal-copy-packet.md`).

This is worse than "blocked" — it is a **live compliance exposure**. I verified:
- `app/(marketing)/privacy` and `/terms` **do not exist** (no route dirs).
- **No DOB/consent capture exists anywhere** — the decided D1 stance (capture DOB, guardian-gate under-16) is unbuilt; `git grep` for `consented_at`/`consent_version` in `supabase/**` returns nothing.

So the product is in production, collecting **passports and bank statements** (documents vault, Supabase Storage) from a user base that **may include minors**, with **no published privacy policy, no APP-5 collection notice, and no consent gate**. Under the APP analysis in the card's own research, that is the highest-severity legal item in the whole codebase, and it is being deprioritized behind a mascot.

**Move: elevate MV-05 to the top of the buildable queue.** The instant the founder supplies D3, carve three agent-ownable slices: (a) publish `/privacy` + `/terms` + footer links from the existing packet; (b) APP-5 at-collection consent gate on `components/documents/document-card.tsx`; (c) DOB capture + guardian-gate migration (the decided D1). None of these need a lawyer to *start* — the copy is approved.

### MV-08 Outcome-validation loop ("the moat") — **[P2] correctly parked, but leaking**

The capture side shipped (Slices 1–5), the migration is applied to prod, and MV-39 (self-report control) is Done. The genuinely blocked part — inbound-email DKIM verification — is legal-gated (PIA, minor consent, VEVO ToS) **and premature**: calibration is worthless with zero resolved outcomes, and the app has no real traffic yet. Keeping the verification path parked is the correct call; do **not** spend on it now.

Two caveats, though: (1) **inert capture code is live in prod** with no verification path — acceptable, but it should be documented as inert so a future reader doesn't mistake self-reported funnel data for validated outcomes. (2) The dossier records **smoke-test rows left in the live DB** (prediction `4bf88e7d`, attempt `073d60dc`, owner `ece83f09`). That is production data hygiene debt — spin a trivial cleanup chore. (I could not query prod to confirm the rows remain — Supabase MCP requires auth in this session; flagged as a claim to verify.)

### MV-55 Scholarships how-to — **[P2] mislabeled "Blocked"**

The card is tagged Blocked/research-blocked, but its own 2026-07-02 note (and project memory) say it is **not externally blocked** — it is reshapeable into a single research+build slice, and an honest subset already shipped as MV-58. Scholarships are a core reason students walk into a consultancy ("what can I get, and how do I apply?"). Leaving this parked under a false "blocked" label starves a genuine consultancy-replacement surface. **Move: re-label MV-55 → Ready, write a dossier (it currently has `file:null`, so it fails Definition-of-Ready), and build the honest eligibility + application-process subset.**

---

## 3. Mascot / imagery cluster (MV-48/49/50/85/86/87) — the wrong next spend

**[P2] Six cards, three of them P1, for decoration that moves zero students.** This directly answers audit question (a): **no, the mascot cluster is not the right next spend versus journey depth.**

| Card | Pri | What it is | Verdict |
|------|-----|-----------|---------|
| MV-85 | **P1** | Global mascot brief + Higgsfield prompt pack | Park |
| MV-86 | **P1** | Imagery-policy amendment for a brand character mark | Trivial doc, keep-if-idle |
| MV-87 | **P1** | Overhaul Phases 1-2 umbrella (do-not-build) | Close/absorb — the non-mascot overhaul already shipped |
| MV-48 | P2 | Two treated marketing photos | Park |
| MV-49 | P3 | Flag pills + NP home nod | Already **killed** by the neutral-brand decision (per memory) — close |
| MV-50 | P3 | Hand-SVG marks on empty states | Park |

Problems:
1. **None have dossiers** (`file:null` for all six) — by the board's own Definition-of-Ready they are not cold-agent-actionable. Three P1s that literally cannot be picked up.
2. **All are founder-gated on a brand-character pick that has not happened** (the "Gate-G mascot tail"). They are P1 in name only; nothing can move.
3. **The product body is deliberately imageless** (`docs/imagery-policy.md`; CLAUDE.md design law: "imageless product body … the anti-AI-look defense is restraint, not more images"). A migratory-bird mascot is confined to marketing + empty states — the lowest-traffic, lowest-stakes surface. It does not touch the wizard→verdict→claim→plan spine where students actually succeed or bounce.
4. MV-49 is **already obsolete** (killed by neutral-global-brand) and MV-87 is an **umbrella marked do-not-build** — both are board clutter inflating the P1 count.

**Move: demote the entire cluster to an icebox lane (P3), close MV-49 and MV-87 as superseded, and keep only MV-86 (a one-paragraph policy amendment) as idle-time work.** Reassign the P1 badges to MV-05 and the new auth card, where P1 is truthful.

---

## 4. MV-27 and MV-38 — stale or valuable?

**MV-27 (strip vs keep mirrored checklist↔plan rows) — [P3] low-value, effectively resolved.** The worst failure mode (double-completing a step) is already mitigated by the plan-links dedup, and MV-23 shipped the mental-model copy. This is a pure aesthetic call (visible duplication vs single-source). It is P4 for a reason. **Move: force the founder's KEEP decision (the card says KEEP is already the low-risk default post-MV-69/71) and close it.** Not worth agent time either way.

**MV-38 (proof-of-funds as "next step" + what /documents is FOR) — [P2] genuinely valuable, elevate.** This is the sharpest item in the backlog because it names a real **trust-honesty gap**, not a polish nit. The `/how` page explicitly tells users uploads *do not change verdict or match scores* (store-only vault), yet the dashboard surfaces "Add proof of funds" as the single teal **"Next step"** (`lib/plan/generator.ts:122-131`, `app/(app)/dashboard/page.tsx:30-36`). A student can upload a bank statement, see the step tick, and believe their *real* visa process advanced when nothing did. For a product whose entire proposition is *honesty about your real chances*, presenting a store-only action as process-advancing is exactly the credibility leak the brand can least afford. It couples with the now-Done MV-37 guided timeline. **Move: elevate MV-38 above the mascot cluster; it is DECIDE-FIRST but the decision is small (reframe /documents as readiness-prep + demote store-only uploads from the single "next step" slot).**

---

## 5. Missing from the roadmap entirely

Beyond the auth dead-end (§1), the following have no card and bear on the north star's *reliability* half:

- **[P1] No error monitoring.** CLAUDE.md lists Sentry in the stack, but `package.json` has **no `@sentry/*` dependency** and there is no `instrumentation.ts`. A trust-first product in production with no server error visibility means a broken claim flow or a 500 on `/api/assess` goes unseen until a student complains — and students who bounce don't complain, they go to a consultancy. Add a "Wire Sentry" reliability card.
- **[P2] Prod data hygiene** — the MV-08 smoke-test rows (§2).
- **[P3] DOB/consent capture** as its own tracked slice (currently buried inside MV-05's prose as a decided-but-unbuilt item).
- **Second-corridor readiness** (non-AU wizard completers hit `UnsupportedDestinationNotice`) is *deliberately* deferred and architecturally supported — correctly out of scope for now; noted, not a gap.

---

## 6. Reordered optimal execution list

| # | Item | Pri | Reasoning |
|---|------|-----|-----------|
| 0 | Board hygiene: MV-99/MV-101 → Done, fix duplicate IDs | P2 | The board is the planning substrate; it currently lies. 10-min chore. |
| 1 | **NEW: Non-Google account path (email OTP/magic-link)** | **P0** | The single largest journey-breaker; kills the #1 self-serve dead-end. Provider-agnostic claim flow already exists. |
| 2 | **MV-05: founder supplies D3 → publish /privacy + /terms + APP-5 consent + DOB capture** | **P1** | Live compliance exposure: passports/bank statements from possible minors, no policy. Copy already approved. Unblocked by 4 facts. |
| 3 | **MV-38: fix the /documents "next step" honesty gap** | **P1** (elevated) | Directly protects the trust proposition; store-only upload masquerades as process progress. |
| 4 | **Wire Sentry (NEW reliability card)** | P1 | Reliability is half the north star; prod currently has no error eyes. |
| 5 | **MV-55: re-label Ready, write dossier, build honest scholarships subset** | P2 | Core consultancy-replacement surface, falsely marked Blocked. |
| 6 | MV-08 smoke-row cleanup (NEW chore) | P3 | Prod hygiene; the verification path itself stays parked (premature). |
| 7 | MV-27: force founder KEEP decision + close | P3 | Resolved in practice; stop carrying it. |
| — | **STOP:** MV-85/86/87/48/49/50 → icebox; close MV-49 + MV-87 | P3 | Decorative, imageless-body product, no dossiers, gated on an un-made brand pick. Reassign the false P1 badges. |
| — | **HOLD (correctly blocked):** MV-08 verification path | P2 | Legal-gated *and* premature (no traffic → no calibration value). |

**The through-line:** every "STOP" item is decoration or premature; every promoted item removes a bounce-to-consultancy or a trust leak. The founder's instinct to invest in brand/mascot before the auth dead-end and the missing privacy policy is the assumption this audit most directly challenges — a beautiful mascot on a funnel a Gmail-less student can't complete, and a passport locker with no privacy policy, is polishing the lobby of a building with no fire exit.
