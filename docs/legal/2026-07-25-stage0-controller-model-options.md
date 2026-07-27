# Stage 0 — Controller-model options memo (consultancy student case workspace)

**Date:** 2026-07-25 · **Status:** DRAFT for founder decision · **Decides:** plan decision **#1** (controller model) and **#13** (lawful basis for staff-entered data) · **Touches:** #7, #12, #14

**Pack:** this memo · [consultancy agreement skeleton](2026-07-25-stage0-consultancy-agreement-skeleton.md) · [product-name decision brief](2026-07-25-stage0-product-name-decision-brief.md)

**Source plan:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` — "Privacy and operational governance", "Lawful basis for staff-entered data", "Stage 0", "Decisions required before implementation".

---

> **Read this first — this is not legal advice.**
> I am not a lawyer. This memo is a **structured decision aid**: it lays out the viable
> structures, names the obligations each one moves, and recommends one with reasons, so
> that a qualified lawyer's time is spent adjudicating a shaped question rather than
> discovering the question. **Every option here must be reviewed by qualified counsel —
> Australian privacy counsel and Nepali counsel — before it is relied on, papered, or used
> to accept a single real student record.** Where I state a legal proposition I name the
> provision so counsel can check it; where I am unsure I say so rather than smoothing it
> over. Nothing in this memo has been verified against the current text of any statute.

---

## 0. What this memo does and does not do

**Does:** set out three structures, answer decision #13 under each, compare them on consent /
retention / breach, recommend one, and list the conditions that must hold for the
recommendation to work.

**Does not:** choose. The controller model is a founder decision with commercial consequences
(what a consultancy will sign, what MeroVisa can promise a student). It is also the one Stage 0
decision that is expensive to reverse, because it determines who the privacy notices name and
who the student believes they are dealing with.

**Gate this memo sits behind:** the plan's rule that *no real student personal data of any kind —
structured fields or files — enters the system before the lawful-basis design, the controller
model, and the consultancy agreement are resolved.* Nothing below relaxes that.

---

## 1. A vocabulary warning that changes the answer

"Controller" and "processor" are **GDPR** terms. The law that most obviously governs this
product's Australian leg — the **Privacy Act 1988 (Cth)** and the Australian Privacy Principles —
does **not** use them and does **not** contain a processor carve-out. Under the APPs there are
only **APP entities**, and an entity that *holds* personal information carries APP 1–13
obligations for it in its own right.

Three consequences the founder should hold onto, because they survive whichever option is picked:

1. **A "we're only the processor" label does not shield MeroVisa.** If student passports sit in
   MeroVisa's Supabase project, MeroVisa holds them and MeroVisa has its own APP 11 security
   obligation and its own obligations under the Notifiable Data Breaches scheme. A contract
   allocates **risk between the parties**; it does not reduce either party's obligations to the
   regulator or to the student.
2. **The closest Australian analogue to "processor" is a use/disclosure distinction, not a status.**
   OAIC guidance treats giving personal information to a service provider bound by contract to
   handle it only for the disclosing entity's purposes as a *use* rather than a *disclosure*.
   That concept is what gives Option A any operative meaning — it is narrower than "processor" and
   it depends on contract terms actually being in place and honoured.
3. **The consent that matters most is governed by Nepali law, not Australian law.** The student is
   in Nepal and the consultancy collects from them in Nepal, so **Nepal's Privacy Act, 2075 (2018)**
   governs that collection. The consultancy is the party physically in the room with the student,
   operating under Nepali law, with an existing engagement relationship. That is a *factual*
   reason the consultancy is better placed to obtain valid consent than MeroVisa is — and it holds
   under all three options.

**Counsel questions:** does the Privacy Act apply to MeroVisa as an APP entity on these facts
(turnover threshold, and whether the small-business exemption is defeated by sensitive-information
handling and by providing a service for a fee — the MV-05 packet already decided **not** to rely on
that exemption); and does any part of the 2024–2026 reform programme (statutory tort for serious
invasions of privacy; automated-decision transparency) bite on a banded readiness estimate shown to
a counsellor? I flag the second as a live question and do **not** assert an answer.

---

## 2. The facts that constrain the choice

These are drawn from the plan and verified against the checked-out tree. They are the facts a
lawyer will ask for.

| Fact | Evidence | Why it constrains the choice |
|---|---|---|
| Staff create a case and may enter identity, financial, academic and immigration data **before** the student has an account or has consented in the product | Plan, "Lawful basis for staff-entered data" | MeroVisa collects personal information **from someone other than the individual** — engages APP 3.6 and APP 5.2 |
| MeroVisa — not the consultancy — determines the scoring engine, matching, plan generation, retention defaults, and security architecture | `lib/scoring/*`, `lib/plan/generator.ts`, plan "Core domain model" | No consultancy instructs these. Calling MeroVisa a pure processor would mislabel the facts |
| The AI guide sends the student's **own assessment payload and plan items** to a third-party model provider | `app/api/guide/chat/route.ts:55-62` → `lib/guide/deepseek.ts:8` (`https://api.deepseek.com`) | A live cross-border processing leg carrying student personal information — squarely decision #14, and an APP 8 question |
| Data at rest is in Supabase (Sydney per the MV-05 packet, **to be reconfirmed**); application hosting is Vercel (likely US/global edge) | `docs/legal/2026-06-20-mv-05-legal-copy-packet.md` §2.5 | APP 8 cross-border disclosure + s16C accountability for overseas recipients |
| **No transactional email capability exists.** No `resend` / `sendgrid` / `nodemailer` / `postmark` / `mailgun` dependency anywhere | verified 2026-07-25 (0 hits each) | The invitation email that every option relies on as the APP 5 notice **cannot currently be sent**. This is a build blocker on the lawful-basis design, not just a nicety |
| Sign-in is Google-only | audit F-6; `components/auth/auth-card.tsx` | A student invited at a non-Google address cannot claim their case — so "the student can see what we hold" is not yet deliverable for every student |
| MeroVisa already is the controller for its existing direct-to-student product | MV-05 packet; `/privacy` drafted in MeroVisa's own name | Whatever is chosen must not contradict the promise already drafted to students |
| A student may hold a personal case **and** a consultancy case | Plan decision #5 (open) | Two different bases for the same person's data in one system; the model must not make the student's own data less accessible to them |

---

## 3. The options

### Option A — Consultancy is sole controller; MeroVisa is a service provider acting on its instructions

**Shape.** The consultancy decides what is collected, why, from whom, and for how long. MeroVisa
supplies the workspace and handles data only on documented instructions. This is the ordinary B2B
SaaS posture.

- **Who obtains student consent:** the consultancy, entirely, through its own Nepali engagement
  process, before any data is entered. MeroVisa relies on a contractual warranty.
- **Retention duties:** set by the consultancy within technical limits MeroVisa offers; MeroVisa
  deletes on instruction and on termination.
- **Breach duties:** MeroVisa notifies the consultancy promptly; the consultancy assesses and
  notifies students and the regulator. **Caveat from §1:** MeroVisa still holds the data, so it may
  carry its own NDB assessment obligation regardless — the contract should coordinate a single
  notification (the NDB scheme contemplates one notification where an eligible data breach concerns
  information held by more than one entity; counsel to confirm the mechanics).
- **Decision #13 answered as:** the consultancy's engagement is the lawful basis; MeroVisa's
  position rests on the warranty plus its own APP 5 notice at invitation.

**In favour:** cleanest to paper; fastest to a signed pilot; consultancies expect it; keeps
MeroVisa out of decisions about students it has never met.

**Against — and these are serious here:**
- It **mislabels the facts.** MeroVisa determines the purposes and means of the scoring engine,
  the plan generator, retention defaults, and the DeepSeek leg. A consultancy does not instruct
  any of that. A label that contradicts the facts is worse than no label, because it produces the
  wrong operational behaviour under pressure.
- It **breaks the founding thesis operationally.** If a student emails MeroVisa asking what is held
  about them or asking for deletion, sole-controller-A obliges MeroVisa to say "ask your
  consultancy." That is precisely the information asymmetry the product exists to remove.
- It **collides with the existing student product**, where MeroVisa already holds itself out as the
  controller in a drafted privacy policy.
- The protection it appears to give MeroVisa is **weaker than it looks** (see §1.1).

**When it is right:** if the pilot consultancy will not sign anything else, and the pilot is
deliberately scoped to no sensitive documents. It is a defensible *starting* posture, not a
defensible *end state*.

---

### Option B — Layered model: each party controls the layer it actually determines *(recommended)*

**Shape.** Split by data layer rather than by party, and say so plainly in both notices.

| Layer | Who determines purposes and means | Examples |
|---|---|---|
| **Platform layer** | **MeroVisa** (controller) | Auth account, the assessment/scoring outputs, matches, generated plan, guide interactions, security and audit records, product telemetry, platform retention defaults |
| **Case layer** | **Consultancy** (controller); MeroVisa acts on instructions | Which student is onboarded, staff-entered profile and financial detail, requested documents, internal operational notes, assignment, case status, case retention within platform limits |
| **Student-contributed data** | **MeroVisa** (controller), visible to the consultancy under the case | What the student enters or uploads through their own claimed account |

- **Who obtains student consent:** **the consultancy** obtains the consent (or other recognised
  basis under Nepali law) for the case layer, before entering anything — warranted in the
  agreement. **MeroVisa independently** gives its own APP 5 notice to the student at invitation and
  obtains its own consent for the platform layer when the student claims the case, exactly as it
  does today for direct students.
- **Retention duties:** MeroVisa sets and enforces platform-layer retention (including the fate of
  unclaimed cases); the consultancy sets case-layer retention within those limits; deletion of a
  case never deletes the student's own account or personal case.
- **Breach duties:** each party assesses breaches in its own layer; a single coordinated
  notification to affected students with one agreed voice; mandatory mutual notification inside a
  fixed window; MeroVisa runs the platform-side assessment because only it can scope a multi-tenant
  incident. The agreement must anticipate that **one incident may oblige notifications through
  several consultancies at once**.
- **Decision #13 answered as:** the consultancy's engagement is the lawful basis for staff-entered
  data — *and* MeroVisa treats itself as collecting personal information from a third party, which
  triggers its own duties. Concretely, MeroVisa requires all five of:
  1. a **warranty** in the agreement that consent was obtained before entry, with the consultancy
     indemnifying MeroVisa for breach of it;
  2. a **per-case attestation** captured at case creation — which staff member, on what date, by
     what method consent was obtained — stored as case metadata and included in the audit record;
  3. an **APP 5 notice to the student as soon as practicable**, delivered as the invitation email,
     stating that a consultancy provided their information, what is held, and how to see or object
     to it;
  4. **full visibility of everything held** the moment the student claims the case;
  5. a **hard gate**: no sensitive-category data (identity, financial, health) may be attached to a
     case until the attestation exists — enforced in the product, not by policy.

**In favour:** it describes what is actually true, so it stays stable under audit and under
incident; it preserves MeroVisa's direct duty to the student, which is the thesis; it is consistent
with the existing student-facing privacy policy; it handles the dual personal/consultancy case
cleanly; and it keeps MeroVisa able to answer a student's access or deletion request about the
platform layer without deflecting.

**Against:** more to paper — needs a data map, two notices, and layer-aware deletion; the boundary
has genuine grey zones (a document the *counsellor* uploads on the student's behalf is case layer;
the same document uploaded by the student is student-contributed — the agreement must say which
rule wins); it asks a pilot consultancy to accept that it is not sole controller, which may need
explaining.

**Cost control for the pilot:** the boundary does not need a full DPA on day one. A **one-page data
map annexed to the agreement**, listing every table and bucket path against a layer, is enough for
a single-consultancy pilot and is the artefact counsel will want anyway.

---

### Option C — MeroVisa is sole controller; consultancy staff are authorised users

**Shape.** MeroVisa determines everything; the consultancy's staff access student cases under
MeroVisa's terms, like an employer using a shared tool.

- **Who obtains student consent:** MeroVisa, directly — which means **no student data may be
  entered before the student has been reached and has consented to MeroVisa**.
- **Retention duties:** MeroVisa's, uniformly.
- **Breach duties:** MeroVisa's, with the consultancy obliged to report and cooperate.

**In favour:** the simplest and strongest student story — one privacy policy, one name, one place to
ask for access or deletion. Maximum consistency with the thesis and with the existing product.

**Against:**
- It **does not solve decision #13; it relocates it onto MeroVisa.** If staff enter data before the
  student is reached, MeroVisa becomes the entity that collected without consent. To make C lawful
  you would have to forbid staff-entered data before student contact — which removes the single
  feature most likely to make the workspace useful ("create a case without registration", MVP item 3).
- It is **factually wrong about the consultancy**, which has its own client relationship, its own
  Nepali-law obligations, and its own decisions about which students to pursue. A consultancy cannot
  contract out of being an APP/Privacy-Act entity for its own client records.
- It concentrates liability in MeroVisa for data whose provenance MeroVisa cannot see.

**When it is right:** if the pilot is restructured so that **the student is invited first and the
case is populated only after they claim it.** That is a real product option and worth a moment's
thought — it would collapse most of this memo — but it changes the MVP, so it is a product decision,
not just a legal one.

---

## 4. Comparison

| | **A — Consultancy sole controller** | **B — Layered *(recommended)*** | **C — MeroVisa sole controller** |
|---|---|---|---|
| Who obtains student consent for staff-entered data | Consultancy only | Consultancy for case layer; MeroVisa for platform layer | MeroVisa — so data cannot be entered pre-contact |
| Whose retention rules govern | Consultancy | Split: platform floor/ceiling set by MeroVisa; case layer by consultancy | MeroVisa |
| Who notifies a breach to students | Consultancy | Coordinated; each assesses its layer, one voice to students | MeroVisa |
| Student asks MeroVisa "what do you hold?" | "Ask your consultancy" | MeroVisa answers for the platform layer, routes case-layer specifics | MeroVisa answers fully |
| Consistent with the founding thesis | ✗ weakest | ✓ | ✓ strongest |
| Consistent with the drafted student privacy policy | ✗ contradicts it | ✓ | ✓ |
| Matches who actually decides things | ✗ no | ✓ yes | ✗ no |
| Effort to paper | Low | Medium | Low |
| Keeps MVP item 3 (case before registration) | ✓ | ✓ | ✗ |
| Reversibility if wrong | Poor — notices already named the consultancy | Moderate | Poor |

---

## 5. Recommendation

**Adopt Option B (layered), and import Option A's discipline for the case layer.**

The reasoning, in order of weight:

1. **It is the only option that matches the facts.** MeroVisa determines the scoring engine, the
   plan generator, retention defaults, the audit design, and the model-provider leg. No consultancy
   instructs those, and no contract makes that untrue. Labels that contradict facts fail exactly
   when they are load-bearing — during an incident or a regulator's question.
2. **It is the only option that keeps the thesis operative rather than aspirational.** The plan
   commits that the student sees what the counsellor sees and that the workspace never becomes a
   tool of information asymmetry. Under Option A those commitments are contract terms the student
   is not a party to and cannot enforce. Under B, MeroVisa holds a **direct** duty to the student
   for the platform layer — so the promise is structural, not merely promised.
3. **It does not require unwinding a promise already made.** The drafted `/privacy` names MeroVisa
   as the entity a student deals with. Option A would require telling existing and future direct
   students that this is now conditional on which door they came through.
4. **It answers #13 without pretending.** The consultancy's Nepali engagement is the lawful basis —
   that part is common to A and B — but B adds MeroVisa's own honest position: *we collected this
   from a third party, so we owe you notice, visibility, and a defined fate for your data even if
   you never claim the case.* An attestation plus a warranty is evidence of diligence, not a
   substitute for consent, and B is the only option that says so out loud.
5. **Option C is stronger on trust but buys it by deleting the feature.** If the founder would
   rather have C's simplicity, the honest way to get it is to change the product (invite first,
   populate after), not to relabel the parties.

**Runner-up: Option A**, but only as a *time-boxed pilot posture* with no sensitive documents
accepted, and with a written commitment to move to B before the workspace holds a single passport
or bank statement. Choosing A permanently means accepting that MeroVisa's answer to a student's
"what do you hold about me?" is a redirection — which is the consultancy's answer today, and the
reason the product exists.

---

## 6. What must be true for the recommendation to work

These are conditions, not nice-to-haves. Each is a Stage 0 or Stage 1 work item.

1. **A data map exists** — every table and Storage path assigned to platform layer, case layer, or
   student-contributed, with the grey-zone rule written down (recommendation: *the uploader
   determines the layer; a counsellor-uploaded document is case layer*). One page, annexed to the
   agreement.
2. **The consent attestation is a product feature, not a policy** — captured at case creation,
   audited, and enforced as a gate on sensitive-category data. A policy that only lives in a PDF
   will be bypassed on a busy Tuesday.
3. **The invitation email can actually be sent.** No email provider exists in the tree today. The
   APP 5 notice depends on it, and so does student claiming. **This is currently the hardest
   blocker on the whole lawful-basis design** and it should be sequenced accordingly.
4. **The invitation email is reviewed as a privacy notice**, not as marketing copy — the plan says
   this and it should be treated as a drafting deliverable with counsel sign-off, in the same pack
   as `/privacy`.
5. **Unclaimed cases have a defined fate** — a maximum period after which an unclaimed case is
   deleted or anonymised. *Founder decision (plan #7/#12); no default is proposed here because the
   right number depends on how long a real consultancy engagement runs before the student is
   reachable — which Stage 0's workflow observation will reveal.*
6. **A bounded window between case creation and student notice** — "as soon as practicable" needs a
   number the product enforces, or it becomes never. *Founder decision.*
7. **The DeepSeek leg is resolved before any case data can reach it.** Today the guide sends a
   student's own assessment to `api.deepseek.com`. Before consultancy cases exist, decide and
   document: whether case-layer data can reach the guide at all, what the provider's terms say
   about retention and training, and where it processes. The plan already forbids sending sensitive
   student data to a model until vendor terms are approved — that rule needs to bind the *existing*
   guide, not only future AI features.
8. **Email sign-in exists, or the visibility promise is qualified.** With Google-only auth, a
   student invited at a non-Google address cannot claim their case and therefore cannot see what is
   held about them. Either fix the auth or state the limit honestly in the invitation.
9. **Adults-only is enforced, not assumed** — the plan's pilot scope says adult students; MV-05
   decided 16+ self-serve with under-16 guardian gating for the direct product. These two postures
   must be reconciled explicitly, and a date-of-birth block or guardian model chosen. *Founder
   decision.*
10. **One identity across product, email, agreement, and notices.** The entity a student is told
    holds their data must match the sender of the invitation and the party on the agreement. See
    the [product-name decision brief](2026-07-25-stage0-product-name-decision-brief.md) — the
    naming decision is a dependency of this one, not a cosmetic follow-up.

---

## 7. Questions to put to counsel

Put these to Australian privacy counsel and, separately, Nepali counsel. They are ordered so that
an answer to an early one may moot a later one.

**Australian counsel**
1. Is MeroVisa an APP entity on these facts, and is the small-business exemption available or
   defeated (sensitive information; service provided for a fee)? *The MV-05 packet assumes it is
   defeated and builds to full APP compliance — confirm that is right.*
2. Does the layered allocation in §3 Option B hold under the APPs, given that the APPs have no
   processor concept? Is there a better Australian framing than "controller/processor" for the same
   split?
3. Staff-entered data: how do **APP 3.6** (collecting from someone other than the individual) and
   **APP 5.2** (notice where information is collected from a third party) apply, and what makes the
   invitation email a sufficient notice? Is there a maximum defensible delay?
4. Is a contractual warranty plus a per-case attestation an adequate basis for MeroVisa to accept
   third-party-sourced sensitive information, or is something stronger required?
5. **APP 8** and **s16C**: the current legs are Supabase (Sydney, reconfirm), Vercel (US/global
   edge), and DeepSeek (`api.deepseek.com`) carrying student assessment content. What must be
   disclosed, and what contractual terms are required for each?
6. NDB scheme mechanics in a multi-tenant incident: who assesses, who notifies, and how is the
   single-notification path coordinated between MeroVisa and several consultancies at once?
7. Does the ESOS/education-agent boundary shift when MeroVisa takes **software subscription fees
   from an education agent**? The MV-05 research concluded MeroVisa sits outside the education-agent
   regime *while it stays provider-neutral and takes no provider commissions*. A SaaS fee from an
   agent is not a provider commission — but this is exactly the drift the dossier warns about, and
   it should be re-tested against the current reform state before money changes hands.
8. Do the 2024–2026 reforms (statutory tort; automated-decision transparency) reach a banded
   readiness estimate relied on by a counsellor?

**Nepali counsel**
9. Under the **Privacy Act, 2075 (2018)**, what makes the consultancy's consent valid, what must be
   recorded, and may the consultancy transfer that data to a foreign platform?
10. Are there localisation, retention, or notification requirements that constrain storing Nepali
    students' documents in Australia?
11. What is required for a minor, if the pilot's adults-only scope is ever relaxed?

---

## 8. Decision record — to be completed by the founder

| # | Decision | Options | Chosen | Date |
|---|---|---|---|---|
| 1 | Controller model | A / B *(recommended)* / C | | |
| 13 | Lawful basis + who obtains consent | per chosen model, §3 | | |
| 13a | Consent attestation captured at case creation | yes / no | | |
| 13b | Max window: case creation → student notice | *days* | | |
| 7/12 | Fate of an unclaimed case | delete / anonymise, after *n* days | | |
| 14 | Case-layer data may reach the model provider | yes / no / not in pilot | | |
| 9 | Adults-only enforcement mechanism | DOB hard block / guardian model | | |

Once #1 is chosen, the [consultancy agreement skeleton](2026-07-25-stage0-consultancy-agreement-skeleton.md)
§4 and §6 fill in from it, and the Stage 0 exit gate can record "agreed controller model."
