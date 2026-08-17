/**
 * The case overview's first region, reserved for the two answers that are the
 * reason a consultancy buys this: the **visa read** and the **lodgement read**
 * (spec §3, "Decision strip").
 *
 * It renders NOTHING today, and that is the whole component.
 *
 * Neither read exists — the judgement contract is unapproved (spec §0) and
 * submittability needs Stage 4's documents. A "Coming soon" panel in the first
 * region would be worse than an empty one twice over: it would train a reader to
 * scroll past the region that will matter most, and it would advertise a product
 * claim nothing behind it can answer yet. Spec §3 says it plainly — "until each
 * feature ships, `case-decision-strip.tsx` returns no visible placeholder; once
 * shipped, it always occupies the first overview region."
 *
 * This file exists rather than the overview simply omitting the region, because
 * the position is the contract: PR 5 (submittability) and PR 7 (visa read) each
 * add their panel HERE, and neither has to relitigate where the answer goes.
 */
export function CaseDecisionStrip(): null {
  return null;
}
