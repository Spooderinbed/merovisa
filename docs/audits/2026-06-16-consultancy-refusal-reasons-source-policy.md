# Consultancy refusal-reasons — source-policy decision packet (I.063–I.070)

- **Date:** 2026-06-16
- **Status:** APPROVED — keep-out policy (2026-06-15). **UPDATED 2026-06-16** with the GS-factor gov-research follow-up — see the addendum directly below, which corrects the I.066/I.070 classification.
- **Scope:** the eight consultancy-sourced refusal-reason findings I.063–I.070 (AHC Lawyers ×4, Aussizz ×4).
- **Decision owner:** product/editorial (you).

---

## Addendum — GS-factor gov-research follow-up (2026-06-16)

This corrects the record below. The original packet classed **I.066 (immigration history)** and **I.070 (course relevance)** as **Class C — "not on file from gov, needs future research."** **That was wrong:** it was based on a category-I-only scan that missed the category-F Genuine-Student module (slice ②). Both factors are in fact **already on file from gov, already `used`, and already displayed in the GS panel**, sourced to **Ministerial Direction No. 106**:

- **Immigration history** → `au-genuine-student.ts` row `md106-history` (findings F.011/F.012/F.025/F.026), Direction 106 **§9**.
- **Course relevance / progression** → rows `md106-course-value` (F.023/F.024) + `md106-scrutiny` (F.015/16/22/27), Direction 106 **§8(5)** and **§11(1)(b)**.

**Verification (read-only workflow, 6 agents, 2026-06-16):** both factors confirmed *verbatim* from two live primary gov sources — the Direction 106 PDF (downloaded directly: §9 immigration history, §8(5) value-of-course, §11(1)(b)(iv) logical course progression) and the DHA Genuine Student page. **Direction 106 is current** ("Revocation: Nil," commenced 23 Mar 2024; the DHA GS page **updated 13/01/2026** still names it as the governing instrument; Directions 107/108/111/115 concern other subjects and do not supersede its GS factors). Side-finding: **s499 migration directions are exempt from the Federal Register of Legislation**, so the Home Affairs PDF — which we already cite — is the correct authoritative source, not legislation.gov.au.

**Therefore I.066/I.070 are repeat-of-gov (Class A), not Class C.** No new rows needed; the content already ships, gov-sourced and current. **Disposition: `triage: stale`** (same as the other repeats), applied 2026-06-16. The owner chose to **leave the GS-panel rows concise** — Direction 106 lists ~5 finer sub-factors (visa cancellation, refused entry, the overstay/left-before-cease test, compliance with other countries' migration laws, the employment-prospects limb) that our one-line rows deliberately abstract; expanding them was declined to honor the panel's calm-authority concision and Direction 106's own "do not treat the factors as a checklist" instruction (F.014). No consultancy source involved at any point.

---

## The question

The gov-only RefusalRecovery panel (`components/results/refusal-recovery.tsx`) now carries 21 rows, **every one linked to a government source** (DHA / ART / NRB / MoEST). The eight consultancy findings were earmarked in the ledger for `app/(app)/journey/refusal-recovery (+ plan rules)` but parked as `needs-human-call` precisely because wiring them would mean **putting consultancy-sourced claims on a trust surface whose entire value proposition is "every row is government-sourced."**

So the call is a *source policy*, not a copy edit: do any of these eight belong on the trust panel, and if so, under what sourcing posture?

---

## Two risks that apply to all eight, regardless of substance

1. **Prevalence framing with no number.** Every finding is an unquantified "many / commonly" assertion ("*many* refusals involve…", "*commonly* occur when…"). The panel's grant-rate rows carry real DHA percentages (85.3% HE, 36.3% VET, Apr–Jun 2025). Placing "many refusals involve X" beside them implies a *measured* prevalence we cannot source — the consultancies give no figure, and DHA does not publish refusal-reason breakdowns by category.
2. **Source-trust dilution.** The panel's guarantee is "every row links to a government source." A single `ahclawyers.com` or `aussizzgroup.com` link breaks that guarantee and invites the reader's next question: "so which *other* rows are just consultancy opinion?" The cost is borne by all 21 gov rows, not just the one added.

These two are sufficient on their own to keep the consultancy *links* off the panel. The per-finding analysis below decides whether the *substance* is worth carrying via a gov source instead.

---

## Per-finding classification

Classification key:
- **A — Repeat-of-gov:** substance already on the panel/ledger from a government source. Adds nothing.
- **B — Additive practitioner red-flag:** a real "how it goes wrong" mechanism, but financial-evidence advice, better suited to a future how-to guide than a refusal trust panel.
- **C — Additive, legislated factor not yet gov-sourced:** a genuine Genuine-Student factor we simply haven't researched from a gov source yet. Belongs in gov language or not at all — never cited to a consultancy.

| Finding | Source | Claim (paraphrased) | Already covered by (gov) | Class | Recommendation |
|---|---|---|---|---|---|
| **I.063** | AHC | GS criteria are a common refusal reason | `ground-genuine-student` (I.008/I.006), GS-credibility slice | **A** | Keep out — already said, gov-sourced |
| **I.064** | AHC | Financial-capacity issues are common | `ground-capacity` (I.029), finance-evidence slice (I.021–024) | **A** | Keep out — already said, gov-sourced |
| **I.065** | AHC | Document inconsistencies are common | `ground-document-integrity` (I.027), `scam-bogus-documents` (I.028) | **A** | Keep out — already said, gov-sourced |
| **I.069** | Aussizz | GS refusals when the statement is vague/copied/irrelevant | `ground-genuine-student` + I.006 (more weight to evidenced GS) + I.003 (answer the questions, not a templated statement) | **A** | Keep out — substance is gov-backed; "copied/templated" is a writing tip for a future guide, not a refusal row |
| **I.067** | Aussizz | Unexplained deposits / sudden large transfers | Partially: source-of-funds slice C (genuine access to funds) | **B** | Keep out of panel — candidate for a future "how to evidence your funds" guide, gov-rewritten from DHA source-of-funds guidance |
| **I.068** | Aussizz | Weak / unverifiable sponsor income | Partially: `certify-sponsor-income` plan item, source-of-funds slice C | **B** | Keep out of panel — same future-guide path as I.067 |
| **I.066** | AHC | Previous immigration history is a factor | ~~Not on file from gov~~ → **GS panel `md106-history`, Direction 106 §9** (F.011/012/025/026) — see addendum | ~~C~~ → **A** | Keep out — already shipped, gov-sourced & current. `stale` |
| **I.070** | Aussizz | No clear link between prior education and chosen course | ~~Not on file from gov~~ → **GS panel `md106-course-value`/`md106-scrutiny`, Direction 106 §8(5)/§11(1)(b)** (F.023/024/026) — see addendum | ~~C~~ → **A** | Keep out — already shipped, gov-sourced & current. `stale` |

---

## Recommendation

**Adopt a keep-out source policy: none of I.063–I.070 go on the gov-only trust panel, and no consultancy source is placed on a trust surface.** Rationale by bucket:

- **Class A (I.063, I.064, I.065, I.069) — nothing to do.** The panel already says all four, in government language, with government links. Adding a consultancy echo only dilutes sourcing (risk #2) and bolts on an unquantified "many" (risk #1).
- **Class C (I.066 immigration history, I.070 course relevance) — SUPERSEDED by the 2026-06-16 addendum.** The gov-research follow-up found both are *already* gov-sourced and shipping in the GS panel (Direction 106, verified current). They are repeat-of-gov (Class A), not "needs future research." Disposition: `stale`. No new rows; no consultancy.
- **Class B (I.067 deposits, I.068 sponsor income) — defer to a future guide.** These are "how to evidence your money" tips, not refusal-panel material. If/when we build an application-strengthening guide, rewrite them from DHA's source-of-funds / financial-capacity guidance (slice C territory). Consultancy stays a pointer.

Net: the trust panel stays 100% gov-sourced; the consultancies are never quoted to a student. *(Per the 2026-06-16 addendum: the two GS factors already have a gov-sourced home — the GS panel — so only the 2 finance tips remain as optional future-guide material.)*

### Ledger disposition (only if you approve)
Record the decision on the findings without changing the gov posture:
- I.063/064/065/069 → `triage: stale` *(superseded by gov rows already shipped)*. **Applied 2026-06-15.**
- I.066/070 → `triage: stale` *(repeat-of-gov via the GS panel, Direction 106 — verified current, see addendum)*. **Applied 2026-06-16** (was retagged needs-human-call on 2026-06-15, then corrected to stale after the GS-factor research).
- I.067/068 → keep `needs-human-call`, retagged "additive finance tip — future guide, gov-rewrite, see packet". **Applied 2026-06-15.**

No `value_status` change, no flip to `used`, no panel edit. (This packet does **not** make these edits — they wait on your "yes.")

---

## Alternatives considered (and why not)

- **Practitioner-context section** ("What practitioners say", citing AHC/Aussizz). Rejected — it is exactly the trust-posture change we're trying to avoid; it makes the consultancy link a feature rather than a leak.
- **Gov-only rewrite now.** Was deferred as premature; the 2026-06-16 GS-factor research then showed it's *moot* — the two GS factors are already gov-sourced and shipping in the GS panel, so there was nothing to rewrite.
- **Wire everything as-is.** Rejected on both cross-cutting risks above.

---

## What this packet leaves unchanged

- RefusalRecovery panel: untouched, still gov-only (21 rows).
- I.063–I.070: still `pending` / `needs-human-call` in `docs/research-briefs/findings/I.jsonl`. No flips.
- Feed / dynamic-data system: still deferred until the **1 July 2026** freshness re-verify shows whether manual reverify is painful enough to justify the infrastructure.

## Decision requested

Pick a policy: **(1) keep-out as recommended** (optionally + queue the Class-C gov-research follow-up), (2) practitioner-context section, (3) gov-only rewrite now, or (4) future guide. On your "yes" to (1) I'll apply the ledger disposition above (triage retags only) and commit this packet.
