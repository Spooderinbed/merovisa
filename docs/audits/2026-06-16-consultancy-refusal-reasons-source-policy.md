# Consultancy refusal-reasons — source-policy decision packet (I.063–I.070)

- **Date:** 2026-06-16
- **Status:** DECISION PACKET — awaiting owner approval. No code, no ledger flips, no panel change made by this document.
- **Scope:** the eight consultancy-sourced refusal-reason findings I.063–I.070 (AHC Lawyers ×4, Aussizz ×4), all currently `status: pending`, `triage: needs-human-call`.
- **Decision owner:** product/editorial (you). This packet *recommends*; it does not act.

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
| **I.066** | AHC | Previous immigration history is a factor | **Not on file from gov** (it *is* a legislated GS consideration) | **C** | Keep out now — candidate for a future gov-sourced row once the GS-factor list is researched from DHA / Ministerial Direction. Never cite AHC for it |
| **I.070** | Aussizz | No clear link between prior education and chosen course | **Not on file from gov** (course relevance *is* a legislated GS consideration) | **C** | Keep out now — same gov-research path as I.066 |

---

## Recommendation

**Adopt a keep-out source policy: none of I.063–I.070 go on the gov-only trust panel, and no consultancy source is placed on a trust surface.** Rationale by bucket:

- **Class A (I.063, I.064, I.065, I.069) — nothing to do.** The panel already says all four, in government language, with government links. Adding a consultancy echo only dilutes sourcing (risk #2) and bolts on an unquantified "many" (risk #1).
- **Class C (I.066 immigration history, I.070 course relevance) — real, but route through gov, not consultancy.** Both are genuine Genuine-Student factors. The honest way to surface them is a small **gov-research follow-up** that sources the GS-factor list from DHA's Genuine Student guidance / the Ministerial Direction, then adds two rows in our own gov-sourced voice. Until that research exists, they stay out. The consultancy finding becomes a *research pointer*, never a displayed source.
- **Class B (I.067 deposits, I.068 sponsor income) — defer to a future guide.** These are "how to evidence your money" tips, not refusal-panel material. If/when we build an application-strengthening guide, rewrite them from DHA's source-of-funds / financial-capacity guidance (slice C territory). Consultancy stays a pointer.

Net: the trust panel stays 100% gov-sourced; the genuinely additive ideas (2 GS factors, 2 finance tips) get a gov-sourced home *later* if you want them; the consultancies are never quoted to a student.

### Ledger disposition (only if you approve)
Record the decision on the findings without changing the gov posture:
- I.063/064/065/069 → `triage: stale` *(superseded by gov rows already shipped)* — or keep `needs-human-call` with a note pointing here. Recommend **stale**.
- I.066/070 → keep `needs-human-call`, retag `triage_reason` to "additive GS factor — needs gov source, see 2026-06-16 packet" (future gov-research slice).
- I.067/068 → keep `needs-human-call`, retag to "additive finance tip — future guide, gov-rewrite, see packet".

No `value_status` change, no flip to `used`, no panel edit. (This packet does **not** make these edits — they wait on your "yes.")

---

## Alternatives considered (and why not)

- **Practitioner-context section** ("What practitioners say", citing AHC/Aussizz). Rejected — it is exactly the trust-posture change we're trying to avoid; it makes the consultancy link a feature rather than a leak.
- **Gov-only rewrite now.** Reasonable but premature: the GS-factor gov research (Class C) isn't done, and doing it well is its own small slice, not a same-session add. Recommended as a *future* option, not now.
- **Wire everything as-is.** Rejected on both cross-cutting risks above.

---

## What this packet leaves unchanged

- RefusalRecovery panel: untouched, still gov-only (21 rows).
- I.063–I.070: still `pending` / `needs-human-call` in `docs/research-briefs/findings/I.jsonl`. No flips.
- Feed / dynamic-data system: still deferred until the **1 July 2026** freshness re-verify shows whether manual reverify is painful enough to justify the infrastructure.

## Decision requested

Pick a policy: **(1) keep-out as recommended** (optionally + queue the Class-C gov-research follow-up), (2) practitioner-context section, (3) gov-only rewrite now, or (4) future guide. On your "yes" to (1) I'll apply the ledger disposition above (triage retags only) and commit this packet.
