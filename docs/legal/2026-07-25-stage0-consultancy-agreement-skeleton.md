# Stage 0 — Consultancy agreement skeleton (section-level outline)

**Date:** 2026-07-25 · **Status:** DRAFT skeleton for counsel · **Serves:** plan Stage 0 exit gate ("an agreed controller model with a drafted consultancy agreement")

**Pack:** [controller-model options memo](2026-07-25-stage0-controller-model-options.md) · this skeleton · [product-name decision brief](2026-07-25-stage0-product-name-decision-brief.md)

**Source plan:** `docs/superpowers/plans/2026-07-23-consultancy-student-case-workspace.md` — "Alignment with the founding thesis", "Privacy and operational governance", "Lawful basis for staff-entered data", "Users and responsibilities", "Export, archive, deletion, and retention", "Primary risks and mitigations".

---

> **Read this first — this is not a contract and not legal advice.**
> This is a **section-level skeleton**: what the agreement must cover, why each section exists,
> what it has to achieve, and which questions are still open. It deliberately contains **no
> operative contract language** — no defined terms, no warranties as drafted words, no
> liability figures — because contract wording written by a non-lawyer tends to be relied on
> and is the wrong artefact to hand a pilot consultancy.
> **A qualified lawyer must draft the actual agreement from this outline before it is sent to
> anyone.** Its purpose is to make that engagement short and well-scoped, and to make sure the
> commercially unusual parts (the consent warranty and the thesis commitments) are not dropped
> because they are unusual.
>
> Two sections — **§4 Roles** and **§6 Student consent warranty** — cannot be finalised until
> the founder picks a controller model. Everything else can be drafted in parallel.

---

## How to read this

Each section gives: **Purpose** (why it exists), **Must cover** (the substance), and where
relevant **Open** (what the founder or counsel must still decide). Sections marked **⚑ thesis**
carry the founding-thesis commitments and should not be traded away in negotiation without an
explicit founder decision — they are the reason a student-protection brand can credibly sell to
consultancies at all.

---

## Part I — Frame

### 1. Parties, commencement, and interpretation
**Purpose.** Identify who is bound.
**Must cover.** Legal entity names of both parties (MeroVisa's entity name is **still outstanding
— MV-05 decision D3**, see the [name brief](2026-07-25-stage0-product-name-decision-brief.md));
registered addresses; the consultancy's Nepali registration details; commencement date; how the
agreement, its schedules, and any online terms rank if they conflict (schedules should lose to the
body, and the product's public terms should not silently override negotiated terms).
**Open.** Trading name vs legal entity name — the product name and the incorporated entity need
not match, but both must be named here and both must match what the student is told.

### 2. Definitions
**Purpose.** Fix the terms the rest of the agreement leans on.
**Must cover.** Case; Case Layer / Platform Layer / Student-Contributed Data (per the chosen
controller model); Student; Authorised User; Internal Note; Document Request; Sensitive Information;
Security Incident; Eligible Data Breach; Export; Pilot Period.
**Note.** The layer definitions must match the data map in Schedule A exactly. If they drift, the
whole controller model becomes unenforceable in practice.

### 3. The service, and the pilot's honest limits
**Purpose.** Say what is being supplied, and — for a pilot — what is *not* promised.
**Must cover.** Description of the workspace; the pilot scope from the plan (Nepal→Australia,
adult students, one consultancy per case, manually onboarded organisations, limited real cases);
explicit exclusions per the plan's "Explicitly outside the MVP" list, so the consultancy does not
buy a CRM in its head; **no uptime, support-response, or data-durability SLA during the pilot**,
stated plainly rather than buried; that features may change or be withdrawn; that the pilot may be
ended by either party.
**⚑ thesis.** State that the workspace supplies **rules-based estimates and general information, not
immigration advice**, and that MeroVisa is not a migration agent, not a law practice, and not an
education agent — carrying the MV-05 boundary into the B2B contract so a consultancy cannot later
say it was sold an advice product.

---

## Part II — Data

### 4. Roles and responsibilities for personal information ⚑ thesis
**Purpose.** Record the controller model. **Blocked on founder decision #1.**
**Must cover.** Which party determines the purposes and means of which layer; that each party is
independently responsible for its own obligations under applicable privacy law and that nothing in
the agreement purports to reduce either party's obligations to a regulator or a student; the
consultancy's acknowledgement that MeroVisa holds a **direct** relationship with the student for the
platform layer, including its own notice and access duties; how a student's pre-existing personal
MeroVisa account and data are unaffected by this agreement.
**Must cross-reference.** Schedule A (data map), Schedule B (role and visibility matrix).
**Open.** Options A/B/C from the controller memo; whether the pilot starts on one model with a
written commitment to move to another before sensitive documents are accepted.

### 5. Purpose limitation and data handling
**Purpose.** Constrain what each party may do with student data.
**Must cover.** Data may be used only to deliver the student's engagement — not for the
consultancy's marketing, not for resale, not for training any model, not for sharing with other
consultancies or providers; minimisation (do not enter what the engagement does not need);
accuracy and correction duties; that documents leaving the workspace (downloads, exports) remain
subject to this section — because in practice staff will download, and a clause that ignores that
is a clause that will be broken; a prohibition on re-uploading a student's documents into other
systems without a basis; the agreed **retention schedule** (Schedule C) including the fate of an
unclaimed case; **sub-processors and cross-border legs** — Supabase (region to be confirmed),
Vercel, and the model provider `api.deepseek.com` — with a duty to notify before adding new ones.
**Open.** Whether case-layer data may reach the AI guide at all during the pilot (controller memo
§6.7). Until decided, the safe drafting position is that it may not.

### 6. Student consent and lawful basis — the consultancy's warranty ⚑ thesis
**Purpose.** This is the section the whole plan hangs on. The workspace lets staff enter a
student's identity, financial, academic and immigration details **before** that student has an
account, has consented in the product, or necessarily knows the case exists. The plan requires the
consultancy's consent obligation to be **explicit and warranted**.
**Must cover.**
- A **warranty**, given on each case creation and repeated as a continuing warranty, that before
  entering any personal information about a student the consultancy has obtained that student's
  consent or another recognised lawful basis under applicable law (including Nepal's Privacy Act,
  2075 (2018)), and has told the student their information will be held in the workspace.
- An obligation to **record and, on request, produce evidence** of that consent — the date, the
  method, and the staff member responsible — matching the per-case attestation captured in the
  product.
- An acknowledgement that the **attestation is evidence of the warranty, not a substitute for
  consent**, and that entering data without a basis is a material breach.
- A prohibition on attaching **sensitive-category data** (identity, financial, health documents)
  to a case before the attestation exists — mirrored by a hard gate in the product, so the contract
  and the software say the same thing.
- MeroVisa's own independent commitments, stated *to the consultancy* so it cannot be surprised by
  them: MeroVisa will give the student a **collection notice at invitation**, will show the student
  **everything held** when they claim the case, and will apply a **defined fate to unclaimed cases**.
- **Withdrawal and objection:** what happens when a student objects, withdraws consent, or asks for
  deletion — who handles it, in what time, and that neither party may simply route the student to
  the other and stop.
- An **indemnity** from the consultancy for loss arising from breach of this warranty. *(Counsel: this
  is the commercially contentious clause; it is also the one that makes the arrangement defensible.)*
**Open.** The maximum window between case creation and student notice (founder decision).

### 7. Documents, uploads, and review
**Purpose.** The workspace's core collaboration surface handles the most sensitive material.
**Must cover.** Who may request, upload, view, download, and approve; that the consultancy is
responsible for the lawfulness of what its staff upload and warrants it has the right to upload it;
handling of documents downloaded from the workspace; prohibition on storing downloaded student
documents on personal devices or personal cloud accounts; malware and safe-handling expectations;
that MeroVisa may quarantine or refuse a file on security grounds.

### 8. Retention, export, archive, and deletion
**Purpose.** The plan requires these to be distinguished before real documents are accepted.
**Must cover.** The three distinct operations — archive a closed case, delete a case, delete a
MeroVisa account — and that deleting a case **never** deletes a student's account, personal case, or
data from another valid relationship; the retention schedule (Schedule C); what a consultancy may
export and in what format; what a student may export; deletion on termination — window, method,
confirmation, and what audit tombstone survives; backup expiry and the honest statement that deleted
data may persist in backups for a stated period; legal hold.
**Open.** Plan decisions #7, #8 (student changes consultancy), #11 (which exports to whom), #12
(what evidence survives deletion, and for how long).

---

## Part III — Security and access

### 9. Security obligations
**Purpose.** Allocate the security duties neither party can discharge alone.
**Must cover.** MeroVisa's commitments — private storage, row-level authorisation, encryption in
transit, short-lived signed URLs, audit logging, and the security baseline in Schedule D; the
consultancy's commitments — account hygiene, no shared or generic accounts, no credential sharing,
device security, prompt reporting of suspected compromise, multi-factor authentication **where the
platform supports it** *(note: sign-in is Google-only today — do not warrant an MFA capability the
product does not yet offer)*; each party's duty not to weaken the other's controls; a right for
MeroVisa to suspend access immediately on reasonable suspicion of compromise, with notice after.

### 10. Acceptable use ⚑ thesis
**Purpose.** Ban the misuses that would damage students or the platform. Some of these are ordinary;
the first two are the thesis in enforceable form.
**Must cover.**
- **No concealment.** The workspace must not be used to withhold or reframe a student's own
  readiness, assessment, or match information from that student.
- **No misrepresentation.** The consultancy must not present MeroVisa's banded estimates as
  guarantees, as approvals, or as immigration advice; must not hold MeroVisa out as its agent or as
  a migration agent; and must not represent that a MeroVisa result improves a visa or admission
  outcome.
- No unlawful use; no attempts to access another organisation's cases; no probing, scraping, or
  penetration testing without written authorisation; no reselling, sublicensing, or white-labelling
  the workspace; no bulk export except the agreed export; no use of the student list for marketing
  unrelated to the engagement; no automated access outside supported interfaces.
- Consequences: suspension, termination, and — importantly — what happens to *students'* access and
  data if a consultancy is suspended, so students are not collateral damage.

### 11. Authorised users, offboarding, and access review
**Purpose.** The plan names departed staff retaining access as a primary risk.
**Must cover.** Named organisation owner and a named privacy/security contact; the consultancy's
responsibility for its Authorised Users' acts and omissions; a duty to **revoke access immediately
on a staff member leaving or changing role**, with a stated maximum time and a duty to notify
MeroVisa; **periodic access review** at a stated cadence, with the consultancy confirming its user
list in writing; least-privilege — counsellors assigned-only by default *(plan decision #2)*; that
role changes happen only through the workspace's controls; MeroVisa's right to revoke an
Authorised User directly on security grounds; that revocation stops new access but a
**previously issued signed URL remains valid until it expires** — an honest statement of the
residual window, since the plan is explicit that "immediate revocation" is a statement about
minting.

### 12. Security incidents and breach cooperation
**Purpose.** One incident may oblige notifications through several consultancies at once; that
cannot be improvised.
**Must cover.** Definitions of Security Incident and Eligible Data Breach; **mutual notification
within a stated short window** of becoming aware (hours, not days); who assesses what — MeroVisa
runs the platform-side assessment because only it can scope a multi-tenant incident; cooperation
duties including preservation of logs and evidence; how the statutory assessment clock is managed;
**a single coordinated notification to affected students with one agreed voice**, and who sends it;
regulator liaison (Australian and Nepali); a rule that neither party makes public statements
naming the other without consent, except where legally required; a duty to provide the other with
the information it needs to meet its own obligations; post-incident review.
**Open.** Whether the pilot warrants a written incident runbook as a schedule. *Recommended: yes —
a pilot is exactly when nobody knows who to call.*

---

## Part IV — Thesis, commercial, and exit

### 13. Student-transparency commitments ⚑ thesis
**Purpose.** The plan states these commitments "belong in the consultancy agreement and in
student-facing notice text, because they are the reason a trust-first student brand can credibly
operate a consultancy product." This section is that. It is unusual for a SaaS agreement and should
be presented to the pilot consultancy as a condition of participation, not as boilerplate.
**Must cover.**
- **Parity of information.** The student sees the same readiness, assessment, and match information
  the counsellor sees. The workspace must never be used to create information asymmetry.
- **Internal notes are for coordination, not concealment.** Consultancy-only content is limited to
  internal operational notes; the visibility classification exists to protect frank internal
  coordination, and must not be used to hold assessment substance out of the student's view. Worth
  drafting with an example of each, because the line is easy to blur in practice.
- **Competition on operational excellence.** The consultancy acknowledges that the workspace is
  designed so consultancies win on faster document turnaround, clearer next actions, and honest
  readiness conversations — not on controlling what the student knows.
- **Honest readiness.** The consultancy will not use the workspace to persuade a student their
  chances are better than the assessment states, and will not suppress a Reach or a refusal-risk
  signal from the student it concerns.
- **Student's own account.** The consultancy will not discourage a student from claiming their case,
  will not claim it on their behalf, and will not use a student's credentials.
- **Enforcement.** Breach of this section is a material breach; consequences should include
  suspension and termination, and the founder should decide whether MeroVisa may **tell affected
  students** if a consultancy is removed for a transparency breach. *(That is a genuinely difficult
  call — it is the most thesis-consistent remedy and the most commercially confronting one. It
  should be decided deliberately, not discovered during an incident.)*

### 14. Feedback, observation, and references
**Purpose.** Stage 0 requires observing the consultancy's real workflow; that involves seeing real
student data and real staff behaviour.
**Must cover.** Consent to workflow observation and interviews; how observation notes and screen
recordings are handled and how student data in them is protected; ownership of feedback and product
ideas; whether MeroVisa may name the consultancy publicly — **opt-in, not opt-out**; and that pilot
findings may be published in de-identified form.

### 15. Fees, term, and termination
**Purpose.** The pilot's commercial shape, and how it ends without hurting students.
**Must cover.** Pilot fees or explicit no-fee status; the pricing hypothesis the pilot is testing
*(plan decision #15)* and that pilot terms do not bind future pricing; term and renewal; termination
for convenience and for cause; suspension rights; **what happens to cases on exit** — export window,
deletion timeline, and the student's continuing access to their own account and data; survival of
confidentiality, data, indemnity, and audit-record clauses.

### 16. Confidentiality, IP, and publicity
**Must cover.** Mutual confidentiality; that student personal information is governed by the data
sections, not the confidentiality section, so it does not accidentally get weaker protection;
MeroVisa's IP in the platform, scoring engine, and content; a prohibition on reverse-engineering or
extracting the scoring rules — noting the architecture rule that scoring is server-side and never
exposed to clients; feedback licence; trade mark use — how the consultancy may refer to the product,
which is another dependency on the **unsettled product name**.

### 17. Liability, indemnities, and insurance
**Must cover.** Liability caps and exclusions, with counsel's view on what is enforceable under the
chosen governing law; carve-outs — the consent warranty (§6), acceptable use (§10), transparency
commitments (§13), and privacy breaches should sit outside or above the ordinary cap; the
consultancy's indemnity for consent-warranty breach; whether cyber-liability insurance is required
of the consultancy. **Open:** governing law and jurisdiction — MV-05 decision D3 is still
outstanding, and a Nepal-incorporated consultancy plus an Australian-facing product makes this a
real question, including which courts and whether an arbitration clause is warranted.

### 18. General
**Must cover.** Notices; assignment and change of control; subcontracting; force majeure; entire
agreement; variation; severability; no partnership or agency — worth stating explicitly given the
migration-agent and education-agent boundaries; survival; counterparts and electronic signature;
governing law and jurisdiction *(D3)*.

---

## Schedules

| Schedule | Contents | Status |
|---|---|---|
| **A — Data map** | Every table and Storage path assigned to platform layer / case layer / student-contributed, with the grey-zone rule. One page. | To draft — follows controller decision |
| **B — Role and visibility matrix** | Owner, admin, counsellor, student: what each may see and do; what an Internal Note is and is not. Plan Stage 0 exit gate requires "one role matrix, one visibility matrix." | To draft in Stage 0 |
| **C — Retention schedule** | Retention per data category; fate of an unclaimed case; post-termination deletion window; audit tombstone; backup expiry. | Blocked on founder decisions #7/#12 |
| **D — Security baseline** | What MeroVisa provides; what the consultancy must maintain; the signed-URL TTL as a stated reviewed parameter. | To draft |
| **E — Sub-processors and cross-border legs** | Supabase (region), Vercel, `api.deepseek.com`, plus any analytics. Notification duty on change. | Needs decision #14 answered first |
| **F — Incident runbook** | Contacts, timelines, who assesses, who notifies, holding statements. | Recommended for the pilot |

---

## Sequencing and dependencies

1. **Founder picks the controller model** → unblocks §4 and §6, and Schedules A and C.
2. **Founder supplies MV-05 D3** (legal entity name, contact email, governing-law jurisdiction) →
   unblocks §1, §17, §18, and the `/privacy` and `/terms` pages this agreement will reference.
3. **Founder settles the product name** → unblocks §16 trade-mark use, the invitation email domain,
   and the identity a student is told holds their data.
4. **Stage 0 workflow observation** → produces Schedules B and C from what the pilot consultancy
   actually does, rather than from what the plan assumes.
5. **Counsel drafts** from this outline; Australian privacy counsel on Parts II–III, Nepali counsel
   on §6's consent mechanics.
6. **Only then** does the plan's privacy gate lift and real student data become acceptable.

---

## Honest limits of this skeleton

- It is an outline by a non-lawyer. Its value is coverage and sequencing, not wording.
- It assumes the plan's pilot shape (one consultancy, adults, Nepal→Australia). A multi-consultancy
  or minors-inclusive rollout changes §6, §12, and Schedule C materially.
- Three sections depend on decisions nobody has made yet (controller model, D3, retention). They are
  marked; they should not be quietly defaulted during drafting.
- The thesis sections (§10, §13) are the ones most likely to be negotiated away by a counterparty
  who reads them as unusual. They are also the ones that make this product coherent. If they are
  softened, that should be a founder decision recorded in the decision log — not a redline accepted
  in passing.
