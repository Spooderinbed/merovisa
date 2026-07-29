# Stage 0 — Founder decision record

**Decisions taken:** 2026-07-29 · **Pack drafted:** 2026-07-25 · **Records:** the three questions the [Stage 0 decision pack](2026-07-25-stage0-controller-model-options.md) put forward

**Pack:** [controller-model options memo](2026-07-25-stage0-controller-model-options.md) · [consultancy agreement skeleton](2026-07-25-stage0-consultancy-agreement-skeleton.md) · [product-name decision brief](2026-07-25-stage0-product-name-decision-brief.md) · this record

This file is the authoritative record of what was decided. Where it conflicts with the drafting
in the other three documents, **this file wins** — they were written before the decisions and are
being brought into line.

---

## D-A · Controller model = **Option B (layered)** ✅ DECIDED

**Plan decision #1. Founder agreed with the memo's recommendation, 2026-07-29.**

Each party is responsible for the layer it actually determines:

| Layer | Responsible | Covers |
|---|---|---|
| **Platform** | **MeroVisa** | Auth account, assessment and scoring outputs, matches, generated plan, guide interactions, security and audit records, telemetry, platform retention defaults |
| **Case** | **Consultancy** (MeroVisa acts on its instructions) | Which student is onboarded, staff-entered profile and financial detail, requested documents, internal operational notes, assignment, case status |
| **Student-contributed** | **MeroVisa**, visible to the consultancy under the case | Whatever the student enters or uploads through their own claimed account |

**Consequently — plan decision #13 (lawful basis for staff-entered data) is answered as:** the
consultancy's own client engagement, obtained under Nepali law before anything is entered, is the
lawful basis for the case layer. MeroVisa additionally treats itself as collecting personal
information from a third party and therefore requires all five of: the contractual warranty; a
per-case consent attestation captured at case creation; an APP 5 notice to the student at
invitation; full visibility of everything held the moment the student claims the case; and a hard
product gate blocking sensitive-category data until the attestation exists.

**Now live work items** (memo §6 — these were conditions on the recommendation, and the
recommendation was accepted, so they are commitments):

1. Data map — every table and Storage path assigned to a layer; grey-zone rule: **the uploader
   determines the layer**.
2. Consent attestation as a **product feature with a hard gate**, not a policy line.
3. **Transactional email capability** — nothing else in the lawful-basis design can function
   without it. Currently the hardest blocker in Stage 0.
4. Invitation email drafted and reviewed **as a privacy notice**.
5. Fate of an unclaimed case — *still open, see below*.
6. Bounded window between case creation and student notice — *still open*.
7. Resolve the `api.deepseek.com` leg before case data can reach the guide — *still open*.
8. Email sign-in, or an honest statement of the limit for non-Google students.
9. Adults-only enforcement reconciled with MV-05's 16+/guardian posture — *still open*.
10. One identity across product, email, agreement and notices — **resolved by D-C below**.

---

## D-B · Consultancy agreement — **counsel engaged when the product is ready** ✅ DECIDED

**Founder, 2026-07-29:** the agreement will be drafted and executed when the product is ready,
not now. The [skeleton](2026-07-25-stage0-consultancy-agreement-skeleton.md) stands as the brief
for that engagement; §4 and §6 can now be filled in from D-A above.

**What this defers, stated plainly so it is not a surprise later.** The plan's privacy gate is
that *no real student personal data of any kind enters the system before the lawful-basis design,
the controller model, and the consultancy agreement are resolved.* Two of those three are now
resolved; the agreement is not. So until counsel drafts and a consultancy signs:

- no consultancy may be onboarded onto real cases;
- no real student personal data may be entered by consultancy staff;
- Stage 0's exit gate is **not** met (it requires "a drafted consultancy agreement" and a named
  pilot consultancy).

**This does not block engineering.** Stage 1 (organizations, memberships, cases, assignments,
invitations, audit events, case-aware RLS, the cross-tenant integration test harness) touches no
real student data and can proceed against seed data. That is the right work to do while the
agreement waits.

---

## D-C · Product name = **MeroVisa** ✅ DECIDED

**MV-136 / audit F-4. Founder, 2026-07-29:** "LandingPad needs to go — it's either MeroVisa or
MyVisa," then chose **MeroVisa**.

**LandingPad is eliminated.** It should not reappear in briefs or docs.

**MV-136's "unique, non-Nepal-specific" criterion is consciously relaxed**, with reasons recorded
so this is not re-litigated later:

- MeroVisa is a **coined word** — distinctive, plausibly registrable. "MyVisa" is near-descriptive
  for a visa product, which is the weakest possible trade-mark position.
- It is the **only candidate with an evidenced domain**: `support@merovisa.app` already ships in
  production on `/trust`.
- The Nepal-specificity objection is weaker than it reads on paper: "Mero" is not legible as
  Nepali to an Australian or Indian audience — it reads as a neutral coined syllable.

**This reverses the rebrand premise.** The rebrand brief's stated purpose was to rename *off* the
MeroVisa placeholder. MeroVisa is no longer a placeholder; it is the name. The mascot work
(MV-85/86 → MV-96, MV-94/95) is unblocked and should be briefed against MeroVisa.

### What this now requires

**The rename sweep runs off "MyVisa", and it is the larger of the two directions** — MyVisa is the
shipped user-facing name, so this is not a cosmetic tidy-up:

| Surface | File |
|---|---|
| Wordmark | `components/layout/logo.tsx:16` |
| Page title | `app/layout.tsx:31` ("MyVisa — Honest answers for studying abroad") |
| Guide self-identity (9 references) | `lib/guide/system-prompt.ts`, `app/api/guide/chat/route.ts`, `app/(app)/guide/page.tsx` |
| Footer, last-resort error boundary | `components/layout/footer.tsx`, `app/global-error.tsx` |
| Package name | `package.json` (`"name": "myvisa"`) |
| **The entire drafted legal copy** | `docs/legal/2026-06-20-mv-05-legal-copy-packet.md` — `/privacy` and `/terms` are written throughout in MyVisa's name and must be re-issued before publishing |

Scale: ~145 case-insensitive `myvisa` matches across `app/`, `components/`, `lib/`, `docs/`,
`package.json`. Per MV-136 this is **its own build card**, not part of this pack.

**Still recommended before the entity is incorporated:** a professional trade-mark and domain
availability search on MeroVisa. The reasoning above is a commercial reading, not a legal opinion,
and no search has been run. Confirm `merovisa.app` is actually held, and decide whether a `.com`
or country domain is also wanted.

**Also now actionable:** stand up DNS/SPF/DKIM/DMARC on `merovisa.app` early — student-facing
transactional mail from a cold domain has a warm-up period measured in weeks, and the invitation
email depends on it.

---

## Still open — founder

| # | Decision | Blocks |
|---|---|---|
| MV-05 **D3a** | Legal entity name | `/privacy`, `/terms`, agreement §1 |
| MV-05 **D3b** | Privacy/support contact email on `merovisa.app` | `/privacy`, `/trust`, invitation email |
| MV-05 **D3c** | Governing-law jurisdiction | `/terms`, agreement §17–18 |
| MV-05 **D3d** | Confirm Supabase + Vercel regions | `/privacy` APP 8 section, agreement Schedule E |
| #13b | Max window: case creation → student notice | Invitation design |
| #7/#12 | Fate of an unclaimed case (delete or anonymise, after how long) | Retention schedule |
| #14 | May case-layer data reach `api.deepseek.com` at all | Guide scope in the workspace |
| #9 | Adults-only enforcement — DOB hard block or guardian model | Pilot scope |
| — | Named pilot consultancy committed to the pilot | Stage 0 exit gate |

D3a–D3d have been open since 2026-06-20. **The name decision makes them answerable** — three of the
four were waiting on it.

---

## Legal review — unchanged

D-A and D-C are **founder decisions about direction, not legal sign-off.** The layered model, the
consent-warranty design, and the notice mechanics all still require review by qualified Australian
privacy counsel and Nepali counsel before any real student record is accepted. The controller
memo's §7 carries 11 questions ordered for that engagement; per D-B, it happens when the product
is ready.
