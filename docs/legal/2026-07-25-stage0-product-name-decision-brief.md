# Stage 0 — Product-name decision brief (MV-136)

**Date:** 2026-07-25 · **Status:** DRAFT for founder decision · **Card:** MV-136 (P1, `backlog`) · **Origin:** 2026-07-10 audit finding **F-4** + the §6-Today founder P0

**Pack:** [controller-model options memo](2026-07-25-stage0-controller-model-options.md) · [consultancy agreement skeleton](2026-07-25-stage0-consultancy-agreement-skeleton.md) · this brief

---

> **This brief does not choose a name.** MV-136 is explicitly a founder decision card, and the
> name is a brand judgment, not a technical one. What follows is the state of play: what ships
> today, what the repo records, what is genuinely blocked, and what the founder needs to supply
> to close it. **Naming also has legal dimensions — trade-mark availability, entity naming, and
> the identity named in privacy notices — and those need qualified counsel, not a repo sweep.**

---

## 1. Why this surfaced now

MV-136 has sat in `backlog` since 2026-07-18 as a standalone brand decision. The consultancy
workspace plan changes its weight in three ways:

- **The name becomes a legal identity, not just a wordmark.** The controller model requires that
  the entity a student is told holds their data matches the party on the consultancy agreement and
  the sender of the invitation email. Three names cannot do that job.
- **A second audience arrives.** The plan is titled "MeroVisa Consultancy Workspace" and sells to
  consultancies. A name chosen only for students now has to carry a B2B product too.
- **The invitation email becomes a privacy notice.** The plan makes the invitation the first moment
  the platform itself touches the student, and says its content "doubles as a privacy notice and
  must be reviewed as one." A privacy notice arriving from a domain that does not match the brand
  in the product is, at best, ignored — and at worst reads as phishing to exactly the cohort most
  targeted by education scams.

So the naming decision is now a **dependency of Stage 0**, not a cosmetic follow-up.

---

## 2. What ships today — three identities, verified

The 2026-07-10 audit recorded it this way:

> Production still ships three identities at once: footer "MyVisa", email `@merovisa.app`,
> repo `MeroVisa`.
> — `docs/audits/2026-07-10-comprehensive/REPORT.md:9`

Re-verified against the tree on 2026-07-25:

| Identity | Where it appears | Student-visible? |
|---|---|---|
| **MyVisa** | Wordmark [`components/layout/logo.tsx:16`](../../components/layout/logo.tsx) · page title [`app/layout.tsx:31`](../../app/layout.tsx) ("MyVisa — Honest answers for studying abroad") · footer · `app/global-error.tsx` · AI guide identity (9 references in `lib/guide/system-prompt.ts`, plus `app/api/guide/chat/route.ts` and `app/(app)/guide/page.tsx`) · `package.json` `"name": "myvisa"` · **the entire MV-05 legal copy packet** — the drafted `/privacy` and `/terms` are written in MyVisa's name | **Yes — this is the name a student sees and the name the legal copy uses** |
| **MeroVisa / merovisa** | Support contact `support@merovisa.app` ([`app/(marketing)/trust/page.tsx:81,84,101,104`](<../../app/(marketing)/trust/page.tsx>)) · GitHub remote `Spooderinbed/merovisa` · dev fixture `dev@merovisa.local` · `CLAUDE.md` project heading · every doc, plan, audit and kanban card — **including the consultancy plan itself** | **Yes — via the support email on `/trust`**, which is the only contact address in the product |
| **LandingPad** | The founder's brief for the 2026-07-10 audit; carried through both audit reports | No — internal only |

**The sharpest expression of the problem:** a student reads "MyVisa" in the header, is told on the
trust page — the page whose entire purpose is credibility — to email `support@merovisa.app`, and
would, under the consultancy plan, receive a case invitation from a third domain. Each surface is
individually fine. Together they are the signature of a scam, on a product whose single
differentiator is being trustworthy.

**Board note (not acted on):** `board.json` lists MV-136's owner as `agent`, while the card body
says `**Owner:** founder`. The card is right — it is a decision card. Flagging only; per the
coordination rules for this task I have not edited `board.json` or `board.md`.

---

## 3. Candidate identities the repo records

**There is no shortlist in the repository.** No naming exercise, candidate list, or
availability check exists in `docs/`. The rebrand research (`docs/design/2026-07-03-rebrand-research.md`)
is design-language research — palette, motion, mascot direction — and contains no name candidates.
So the honest inventory is: the three identities already in use, plus the constraints on file.

| Candidate | Case for | Case against |
|---|---|---|
| **MyVisa** | Already the student-visible wordmark and the name throughout the drafted legal copy; zero re-drafting of `/privacy` and `/terms`; cheapest path to publishing them | Highly generic and near-descriptive for a visa product — likely weak as a trade mark and probably crowded with existing services (**needs a professional availability search — I have not run one and cannot assert the position**); `myvisa.*` domains are unlikely to be obtainable; says nothing about the product's actual promise |
| **MeroVisa** | Owns the only contact domain evidenced in the product (`merovisa.app`) and the repo/remote; the consultancy plan is written in this name | **Explicitly the placeholder the rebrand is meant to retire.** "Mero" is Nepali for "my", which conflicts directly with MV-136's *non-Nepal-specific* constraint — it hard-codes a single source market into the brand at the moment the product is expanding its audience |
| **LandingPad** | The founder's own working title in the audit brief — some signal of preference; evocative and non-Nepal-specific; carries an arrival/settling metaphor that survives an expansion beyond visas | Never shipped anywhere; likely crowded (a common startup/coworking term) — availability unknown; no evidence of a domain; loses the drafted legal copy's name and requires re-issuing it |
| **A new name** | Only path that satisfies every recorded constraint at once and gives the mascot work a clean start | Costs a naming exercise, a search, a domain, and re-drafting the legal copy; delays Stage 0 |

**Constraints recorded in the repo**

- **Unique and non-Nepal-specific** — MV-136 acceptance criteria, from the rebrand brief.
- **Name first, mascot second** — MV-136 resume notes; the mascot cluster (MV-85/86 → MV-96, MV-94/95)
  is explicitly waiting on this, as is the deferred OpenGraph image.
- **Original "ringtail"-inspired mascot direction**, tail as a progress motif — recorded in project
  memory as the founder's 2026-07-07 direction, superseding the earlier bird plan. Not in a repo doc.
- **Calm-authority design language** — a name that needs shouting will fight the visual system.
- **New, from the plan:** must work for a B2B consultancy workspace as well as a student product.

---

## 4. What blocks on this decision

### 4.1 Legal entity naming — MV-05 decision **D3**
`/privacy` and `/terms` are drafted but **cannot publish**: the copy carries `[LEGAL ENTITY NAME]`,
`[CONTACT EMAIL]`, and `[JURISDICTION]` placeholders, and there are no `privacy` or `terms` routes in
`app/(marketing)/` today. MV-05 has been `blocked` on D3 since 2026-06-20.

A useful separation worth putting to counsel: **the incorporated entity name and the trading name
need not match** — companies commonly incorporate as one and trade as another. If that holds in the
chosen jurisdiction, incorporation could proceed before the brand is final, unblocking D3's entity
field without forcing the naming decision. **Do not act on this without confirming it with counsel
in the actual jurisdiction** — and note it does not remove the need for the trading name to be
consistent everywhere the student sees it.

### 4.2 The consultancy agreement
The agreement skeleton needs, in §1, §16 and §18: MeroVisa's legal entity name, the product name the
consultancy is licensed to reference, and the governing-law jurisdiction. A pilot agreement can be
drafted around a placeholder, but it cannot be **signed** under a name the product does not use.

### 4.3 The invitation email domain
The most operationally binding of the four.

- The plan makes the invitation email the platform's **first contact with the student** and its
  **APP 5 collection notice**.
- The sending domain must match the brand in the product, or the notice fails at its job.
- **No email capability exists today** — verified 2026-07-25: zero references to `resend`,
  `sendgrid`, `nodemailer`, `postmark`, or `mailgun` anywhere in the tree. This is also audit F-7.
- A sending domain needs DNS, SPF, DKIM and DMARC, plus reputation warm-up. Sending student-facing
  transactional mail from a **freshly registered domain** is a deliverability problem measured in
  weeks — so the name decision has a lead time attached to it that is easy to underestimate.
- The same applies to the Google OAuth consent screen, which shows the app name at sign-in.

### 4.4 Controller identity
Under any controller model, one name must appear consistently as: the entity in the privacy notice,
the sender of the invitation, the party on the consultancy agreement, the recipient of an access or
deletion request, the notifier in a data breach, and the respondent to a regulator complaint. Today
that name would be "MyVisa" in the policy, "merovisa.app" in the only contact route, and whatever is
incorporated in the agreement. That is not a branding inconsistency; it is a defect in the
accountability chain, and it is the reason this brief sits in the Stage 0 pack.

### 4.5 Downstream, already waiting
- **Mechanical rename sweep** — MV-136 requires this be its own build card. Scale: ~145
  case-insensitive `myvisa` matches and ~84 `merovisa` matches across `app/`, `components/`, `lib/`,
  `docs/`, `supabase/`, `package.json`. Mechanical but wide; the user-facing subset is small
  (logo, layout title, footer, guide prompt, global-error, trust page).
- **Mascot cluster** (MV-85/86, MV-96 foundation, MV-94/95 slots) — blocked by "name first."
- **Deferred OpenGraph image** (Gate-G) — needs the final wordmark.
- **Domain purchase and support address** — `support@` must live on the chosen domain.
- **Supabase/Vercel project naming and the OAuth consent screen** — cosmetic but student-visible at
  sign-in.

---

## 5. Sequencing — what can and cannot proceed without the name

**Can proceed now:** the controller-model decision; counsel engagement on the agreement; Schedules B
and C (role matrix, visibility matrix, retention) from Stage 0 workflow observation; the tenancy
schema and authorization work in Stage 1 — none of it references a brand.

**Cannot proceed:** publishing `/privacy` and `/terms`; signing a consultancy agreement; sending any
student-facing email, which means **the invitation flow, which means the lawful-basis design for
staff-entered data**. That chain is the reason to treat this as a Stage 0 item rather than a
pre-launch tidy-up.

**Recommended order** (mechanics, not the choice itself):
1. Founder picks the name.
2. Trade-mark and domain availability search on the pick — **before** anything is committed.
3. Register the domain and stand up DNS/SPF/DKIM/DMARC early, so warm-up runs in the background
   while other Stage 0 work continues.
4. Supply MV-05 D3 (entity, contact email, jurisdiction) — with counsel on the entity-vs-trading-name
   question.
5. File the rename-sweep build card; publish `/privacy` and `/terms`; then the invitation email can
   be drafted as a reviewed privacy notice.

---

## 6. What the founder needs to supply

| # | Item | Blocks | Supplied |
|---|---|---|---|
| N1 | **The name** — one identity for product, domain, email, and agreement | Everything in §4 | |
| N2 | Confirmation that the mascot brief follows this name | MV-85/86, MV-96, MV-94/95, OG image | |
| N3 | Legal entity name *(MV-05 D3)* | `/privacy`, `/terms`, agreement §1 | |
| N4 | Privacy/support contact email on the chosen domain *(D3)* | `/privacy`, `/trust`, invitation email | |
| N5 | Governing-law jurisdiction *(D3)* | `/terms`, agreement §17–18 | |
| N6 | Confirm hosting regions — Supabase region, Vercel region *(D3-adjacent)* | `/privacy` APP 8 section, agreement Schedule E | |
| N7 | Whether a professional trade-mark search is commissioned before committing | Whether the pick is safe to build on | |

N3–N6 are the four facts MV-05 has been blocked on since 2026-06-20; they are listed here because the
name decision is what makes three of them answerable.

---

## 7. Explicitly out of scope for this brief

- **Choosing the name.** Founder's call, per MV-136.
- **Asserting trade-mark availability.** No search has been run; the "case against" notes in §3 are
  commercial intuitions, not legal opinions, and must not be relied on.
- **The rename sweep itself.** MV-136 requires it be a separate build card, and no product code has
  been touched in preparing this pack.
- **Editing the board.** Per this task's coordination rules, `board.json` and `board.md` are
  untouched; the owner-field discrepancy in §2 is flagged for whoever next updates the board.
