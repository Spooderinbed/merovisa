# MV-200 — Judgement slice 3: the caseload roll-up

The third and last slice of the judgement layer. Spec:
`docs/superpowers/specs/2026-08-29-judgement-layer.md`.

The org students list
(`app/(app)/workspace/[organizationId]/students/page.tsx`) gains the two reads MV-198
and MV-199 already compute, as sortable, filterable columns: *who is closest to
submittable*, *who carries the most refusal risk*.

## Deliberately last, and deliberately small

Capability **#3** in `docs/research/2026-08-11-program-data-wedge.md` §6, and the
research is blunt about its status:

> **PLAUSIBLE-BUT-UNEVIDENCED.** Nobody I found asks for it. **[I]** but it is close
> to free once #1 and #2 exist and the case model is in place.

So it earns **no design investment beyond sorting numbers already computed**. If
this slice starts growing filters, saved views, or a dashboard, it has escaped its
evidence. Cross-caseload dashboards are commodity-CRM surface, and CLAUDE.md
forbids building commodity parity ahead of the wedge — this card is allowed only
because it is nearly free, not because it is wanted.

**Blocked on MV-198 and MV-199.** There is nothing to roll up until both reads
exist. Do not start it early by computing a second, parallel version of either read
— that is how two answers to the same question end up on two screens.

## Watch the cost

The students list renders every case in the org. Two per-case judgement reads
computed per row is a fan-out, and the pilot's first real caseload is the moment it
shows. Decide deliberately whether the reads are computed on read, cached, or
persisted alongside the assessment — and write the decision down. A correct answer
that takes eight seconds to list forty students fails the card.

## Sketch of acceptance criteria — to be firmed at Ready

1. The list shows both reads per case, banded, sentence case, imageless.
2. Sort and filter by each, server-side.
3. One source of truth: the columns consume the same functions the case surfaces
   do — no parallel re-derivation.
4. A measured cost decision (compute / cache / persist) recorded with the numbers
   that justified it, at a realistic caseload size.
5. Tenant isolation holds: the list can never surface a case outside the org, in
   RLS *and* TypeScript, mutation-tested.
