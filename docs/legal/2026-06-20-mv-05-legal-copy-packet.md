# MV-05 — Legal copy packet (DRAFT for founder sign-off)

**Date:** 2026-06-20 · **Card:** MV-05 · **Status:** Copy **Codex APPROVED-WITH-NITS** (2026-06-20; nits applied). Disclaimer swap wired; `/privacy` + `/terms` pending founder D3.

> **Read this first.** I am not a lawyer and this is not legal advice or legal review.
> This packet is a **credible interim shield**: plain-language policy text, grounded in
> the gov-sourced research in the MV-05 dossier, that materially lowers MyVisa's
> exposure before a lawyer reviews it. It is designed so that (a) we can launch behind
> a defensible boundary, and (b) a lawyer's later review is more likely to refine
> *wording* than require a structural rebuild — that is the design goal, not a guarantee,
> and not itself a legal conclusion.
> **Nothing here ships until you sign off the copy** — that is the whole point of this
> step. After sign-off I wire `/privacy`, `/terms`, footer links, and the at-collection
> notice.

---

## 0. What you must decide before wiring

D1 + D2 **decided by founder 2026-06-20** (baked into the copy below). **D3 still required**
before `/privacy` + `/terms` can publish — these are facts only you can supply.

| # | Decision | Status | Resolution |
|---|----------|--------|------------|
| **D1** | **Under-18 stance** | ✅ **DECIDED** | **16+ self-serve; under-16 requires verified guardian consent; capture date of birth at sign-up.** (Founder chose the recommended option.) |
| **D2** | **Retention period** for uploaded sensitive docs | ✅ **DECIDED** | **Retain while the account exists; delete only when the user deletes their documents/account** (no automatic time-based deletion). See the APP 11.2 reviewer note in Privacy §7. |
| **D3** | **Business identity + contact + governing law** | ⛔ **STILL NEEDED** | Supply: `[LEGAL ENTITY NAME]` (data controller), privacy contact `[CONTACT EMAIL]`, governing law `[JURISDICTION]`. The policy can't publish with these blank. |

**Hosting facts to confirm (D3-adjacent):** the policy states where data lives. Current
stack: **Supabase Postgres + Storage in `ap-southeast-1` (Sydney, Australia)** and
**Vercel** (confirm function/region — likely US/global edge). If either is wrong, the
APP 8 cross-border section below must change.

---

## 1. Not-immigration-advice disclaimer (tightened)

Replaces the current `NOT_ADVICE_DISCLAIMER` string
(`components/ui/verdict-disclaimer.tsx`). Same placement mechanism; tighter copy that
folds in "the law and the decision-maker decide" + "see a registered agent/lawyer for
your case."

**Canonical short form (near every verdict / results / dashboard):**

> This is a rules-based estimate, not immigration advice. Your result comes from
> published rules and can change — it is not a guarantee of any visa or admission
> outcome. The relevant decision-makers decide your case under the rules that apply at
> the time — the Department of Home Affairs for your visa, and each institution for its
> own admission. For advice on your own application, see a registered migration agent
> ([OMARA](https://www.mara.gov.au/)) or a lawyer.

**Surface-tailored variants (keep the structure, swap the lead clause):**
- *Matches:* "Program matches are rules-based estimates against published thresholds, not
  immigration advice. …" (rest as above.)
- *Plan:* "Your plan is ranked by rules-based impact estimates, not immigration advice. …"

**One-line footer/legal-strip form:**

> MyVisa gives general information and rules-based estimates only — not immigration
> advice, and not a guarantee of any outcome.

### At-collection notice + consent (APP 5 + APP 3.3) — shown at the document-upload step

This short, plain-language block appears **before** any sensitive upload. It is both the
APP 5 just-in-time notice and the APP 3.3 express consent moment — distinct from the
Privacy Policy and never bundled into the Terms.

> **Before you upload this document.** You're about to give MyVisa a sensitive document
> (for example your passport, bank statement, or academic record). We collect it only to
> build your document checklist, store it privately in Australia, never sell it, and let
> you delete it at any time. See our [Privacy Policy](/privacy) for the full detail.
> **By tapping "I consent & upload", you consent to MyVisa collecting and storing this
> document.**  · [I consent & upload] · [Cancel]

*(For 16–17-year-olds this is the separate consent required by Terms §4; for under-16s the
guardian gives it.)*

---

## 2. Privacy & data-retention policy (`/privacy`)

> **Note:** drafted to meet the Australian Privacy Principles (APPs) — we do **not** rely
> on the small-business exemption (it is defeated by handling sensitive information).
> Structured to the seven APP 1 mandatory contents, plus retention, cross-border, and
> breach response. Note that *operative* APP compliance also depends on the consent,
> at-collection-notice, DOB/guardian and retention **flows** being wired (Section 5) —
> this is the policy text, not a claim those flows already ship.

### MyVisa Privacy Policy

**Last updated:** `[DATE ON PUBLISH]`

**1. Who we are.** MyVisa ("we", "us") is operated by `[LEGAL ENTITY NAME]`. We help
prospective international students assess, with rules-based estimates, their chances of
studying in Australia. You can contact us about privacy at **`[CONTACT EMAIL]`**.

**2. What personal information we collect.**
- **Account:** your name and email (via Google sign-in).
- **Assessment profile:** country, academic results, English test results, finances,
  intended study, work history, and similar details you enter.
- **Sensitive information** (only when you choose to upload it for the document
  checklist): identity documents (e.g. passport), financial documents (e.g. bank
  statements), and academic records.
- **Technical:** basic device/usage data needed to run and secure the service.

**3. How and why we use it.** To generate your rules-based estimate and a document
checklist/plan built from published requirements, to maintain your account, to keep the
service secure, and to improve it. These outputs are general information tailored to what
you enter — not advice on your individual case. **We do not sell your personal
information.** Your MyVisa result is an estimate you choose to act on — not a decision we
make about your visa or admission, and not a substitute for the relevant decision-maker.

**4. Consent for sensitive information (APP 3.3).** We collect sensitive information
**only with your express, specific consent**, given separately at the point you upload
each category — it is **not** bundled into accepting these terms. You can decline; you
simply won't use the document features.

**5. Disclosure & overseas storage (APP 8).** We use trusted service providers to run
MyVisa: **Supabase** (database and document storage, hosted in **Sydney, Australia**) and
**Vercel** (application hosting — confirm region; likely the **United States** / global
edge). Running the service may therefore involve storing or processing your information in
`[Australia and the United States — confirm on publish]`. We disclose personal information
to these providers only to operate the service, and we do not otherwise disclose it except
where required by law.

**6. Security (APP 11.1).** Documents are held in a private store with row-level access
control so each user can reach only their own data; access is restricted and traffic is
encrypted in transit. No system is perfectly secure, but we take reasonable steps to
protect your information.

**7. Retention & deletion (APP 11.2).** We keep your information for as long as your
account is active, so your assessment, checklist, and uploaded documents are there when
you return. **You can delete your uploaded documents, or your whole account and all
associated data, at any time** from your account settings ("Delete your account") — this removes
your uploaded documents, your profile and assessments, and your sign-in identity — when you
delete something, we remove it from our systems.

> **⚠ Reviewer note (not policy text) — D2 = "retain until account deletion".** You chose
> no automatic time-based deletion. This is defensible for an *active* account (the data is
> still needed for the user's assessment), but it is the **weakest data-minimisation
> posture** for sensitive docs and the most likely point a lawyer pushes back on. Low-cost
> hardening you can add later without changing the policy's promise: an inactivity sweep
> (e.g. delete docs after 12 months dormant) — it only *strengthens* "when you delete, we
> delete." Flagging so the choice is eyes-open.

**8. Your rights (APP 12 / 13).** You can access and correct your personal information,
and ask questions or make a privacy complaint, by contacting **`[CONTACT EMAIL]`**. We
will acknowledge your request or complaint and respond within a reasonable time (generally
within 30 days). If you are not satisfied with our response, you can complain to the
**Office of the Australian Information Commissioner (OAIC)**.

**9. Children.** See our age policy in the Terms of Service (Section 4). In short:
under-16s require verified parent/guardian consent; 16–17s may use MyVisa themselves but
must give separate consent before uploading any documents.

**10. Data breaches (NDB).** If a data breach is likely to cause serious harm, we will
assess it promptly and notify affected users and the OAIC as required by the Notifiable
Data Breaches scheme.

**11. Changes.** We may update this policy; we'll change the "last updated" date and, for
material changes, tell you in the app.

---

## 3. Terms of Service (`/terms`)

### MyVisa Terms of Service

**Last updated:** `[DATE ON PUBLISH]`

**1. What MyVisa is — and isn't.** MyVisa provides **general information and rules-based
estimates** to help you plan study in Australia. **MyVisa is not a migration agent, not a
law practice, and not an education agent. We do not give immigration assistance or
immigration legal advice, we do not act for you with the Department of Home Affairs, and
we do not prepare or lodge applications.** MyVisa is provider-neutral: **we do not take
commissions or referral fees from education providers.** Our estimates are not a
substitute for advice from a registered migration agent (OMARA) or an Australian legal
practitioner.

**2. No guarantee.** Your result is an estimate based on published rules and the
information you provide. It can change and **is not a guarantee of any visa grant,
admission, scholarship, or other outcome.** Only Australian migration law and the
relevant decision-maker determine your case.

**3. Accuracy & your reliance.** We work to keep our information current and source-linked,
but rules and figures change and may contain errors or omissions. **You use MyVisa's
information and estimates at your own discretion and risk, and should verify anything
important against the official source or a qualified adviser before acting on it.** To the
extent permitted by law, we are not liable for decisions you make in reliance on the
service. *(Nothing in these terms excludes rights you have under applicable consumer law.)*

**4. Eligibility & age.** You must be at least **16** to use MyVisa yourself. If
you are **16 or 17**, you confirm you understand what MyVisa is and is not, and you must
give the separate, plain-language consent we ask for before uploading any documents. If
you are **under 16**, a parent or guardian must set up and supervise the account and give
consent on your behalf — in that case references to "you" in these terms include that
guardian. We may ask for date of birth to apply this policy.

**5. Your account & content.** Keep your sign-in secure. You're responsible for the
accuracy of what you enter, and you confirm you have the right to upload any document you
provide.

**6. Acceptable use.** Don't misuse the service (no unlawful use, no attempts to break
security, no scraping our content or reselling it as your own assessment service).

**7. Privacy.** Our handling of your personal information is governed by the
[Privacy Policy](/privacy).

**8. Changes & termination.** We may update these terms or the service; material changes
will be notified in-app. You can stop using MyVisa and delete your account at any time.

**9. Governing law.** These terms are governed by the laws of `[D3: JURISDICTION]`.

**10. Contact.** Questions about these terms: **`[CONTACT EMAIL]`**.

---

## 4. Under-18 stance (the statement behind D1)

**Recommended policy:** **16+ self-serve; under-16 guardian-gated.** Capture date of birth
at sign-up (a real DOB field, not an "I am over 18" tickbox).

- **Why not 18+-only:** many genuine Nepal→Australia applicants are 17 when they start
  planning. An 18+ wall turns them away for no compliance gain — the Privacy Act sets no
  fixed age of consent; the OAIC's guidance is **capacity-based** (generally a child 15+
  can usually consent for themselves), so a 16+ self-serve line sits comfortably inside it.
- **16–17:** capacity presumed, but a **separate plain-language consent** is required
  before any passport/bank/academic upload (this is the APP 3.3 consent, not buried in the
  Terms).
- **Under-16:** **verified parent/guardian consent** required before use.
- **Direction of travel:** Australia's draft **Children's Online Privacy Code** is due
  **10 Dec 2026**. We cite it as direction, not settled law, and the DOB-based design lets
  us tighten later without re-architecting.
- **Cross-refs:** stated in Terms §4 and Privacy §9; relies on the existing deletion path.

> **Implementation note (post-sign-off, separate slice — NOT this packet):** a DOB field
> at sign-up + the under-16 guardian gate + the per-upload sensitive-info consent need a
> small schema/UI change (`consented_at`, `consent_version`, DOB) and a prod migration —
> founder-approved, after the copy is locked.

---

## 5. Wiring plan (after you sign off the copy)

Only once the copy above is approved:
1. `/privacy` page (Section 2) + `/terms` page (Section 3) — static server components in
   the calm-authority shell; footer links from the marketing + app chrome.
2. Swap the tightened disclaimer (Section 1) into `NOT_ADVICE_DISCLAIMER` + the two
   tailored variants; update the disclaimer tests.
3. **APP 5 at-collection notice** — a short just-in-time line at the document-upload step
   (distinct from the policy), pointing to `/privacy`.
4. **Consent-at-upload + DOB/guardian gate** — the schema/migration sub-slice above (its
   own card; needs founder DB approval).

Steps 1–2 are copy + static pages (low risk). Steps 3–4 touch data collection and need the
founder decisions (D1/D2) locked first.

---

## 6. Honest limits of this shield

- I am not a lawyer; this lowers risk but is not legal sign-off. Have a lawyer review the
  wording before scaling / monetising (the architecture is built to survive that review).
- The ESOS/education-agent boundary holds **only while MyVisa stays provider-neutral and
  takes no provider commissions** (per the dossier). Any provider-paid monetisation →
  dated AU legal advice first.
- The OMARA/s276 boundary holds **only while MyVisa gives general info + banded estimates
  and never advises on a user's own application**. Keep the product on that side of the line.
