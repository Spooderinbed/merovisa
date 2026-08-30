import "server-only";
import { generateChecklist } from "@/lib/checklist/generator";
import { completion, computeReadiness } from "@/lib/checklist/readiness";
import type { LinkedPlanState } from "@/lib/checklist/plan-links";
import type { ChecklistItem } from "@/lib/checklist/types";
import type { DocumentKind } from "@/lib/documents/types";
import type { ShortlistStatus } from "@/lib/matches/repo";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { Program } from "@/lib/programs/types";

/**
 * The submittability read (MV-199, judgement-layer slice 2) — capability #2 of the
 * 2026-08-11 wedge research: *"which of my students is actually submittable, and what
 * single item is blocking each"*.
 *
 * ## What this module is, given that the rollup already existed
 *
 * MV-199's criterion 1 measured that `computeReadiness` is already an honest per-stage
 * "X of Y required ready", and that the gap is REACH: it is called from the student's
 * checklist view and nowhere else, so no case-scoped read can reach it. So this module
 * **lifts** that function rather than reimplementing it. The numbers below come from
 * `computeReadiness`; the per-row detail comes from the same `completion` predicate it
 * uses, and `apply.ready` is asserted equal to `computeReadiness(...).now.ready` so a
 * second denominator cannot quietly grow beside the first.
 *
 * What is genuinely new is the two things a checklist has never had: an entry point
 * that is scoped to a CASE rather than to a page, and a **ranked single blocker**.
 *
 * ## Which program, and why the question is unavoidable
 *
 * `generateChecklist` needs a program: a bachelors case must show +2 and SLC/SEE, a
 * postgraduate one transcripts. A case has no chosen program — `cases` holds no
 * program column — so the only signal is the shortlist (`user_program_state`), which
 * carries `shortlisted | applied | withdrawn` and no ordering.
 *
 * The rule is therefore authored, and it refuses rather than guesses:
 *
 * 1. Withdrawn entries are never candidates.
 * 2. `applied` outranks `shortlisted` — an application is a commitment a save is not.
 * 3. If every candidate produces the SAME required set, which one is picked cannot
 *    change the answer, so the read is stated and names the lowest-id program it drew
 *    its rows (and their provenance) from, plus how many others it also covers.
 * 4. If they produce different sets, the answer would depend on the guess, so there is
 *    no answer: `programs-differ`.
 *
 * ## Two notions of "outstanding" that must not stand in for each other
 *
 * `lib/cases/lodgement.ts` reads `case_document_requests` — what a counsellor thought
 * to ASK FOR, with no denominator. This module reads what the program and DHA
 * REQUIRE, which has one. Neither is a substitute for the other, and they are rendered
 * as separate regions for that reason.
 */

export interface SubmittabilityRow {
  key: string;
  label: string;
  done: boolean;
  /**
   * Only where the checklist row actually carries one. Coverage is PARTIAL by
   * measurement — the passport row is sourced only while it is missing, the English
   * row only when the program has a URL — so this is optional and a row without it
   * makes no sourced claim rather than borrowing a neighbour's.
   */
  source?: { url: string; lastVerified?: string };
}

export interface StageSubmittability {
  ready: number;
  total: number;
  complete: boolean;
  /** Every row that counted — the per-row explainability behind the two numbers. */
  rows: readonly SubmittabilityRow[];
}

export type SubmittabilityRead =
  /** The read failed. Produced by the reader, never by this module. */
  | { state: "unavailable" }
  | { state: "no-program" }
  | { state: "programs-differ"; programCount: number }
  | {
      state: "read";
      program: { id: string; name: string };
      /** Other candidate programs whose required set is identical to this one's. */
      alsoCovers: number;
      /** The now-stage set — what an application needs. Never a claim about lodgement. */
      apply: StageSubmittability;
      /** The after-offer set — the visa-stage evidence, which no offer-less case can hold. */
      lodge: StageSubmittability;
      /** The one item to chase next, by `BLOCKER_RANK_ORDER`. Null when nothing is left. */
      blocker: SubmittabilityRow | null;
    };

/**
 * **The ranking rule** (criterion 3), authored here and nowhere else.
 *
 * A `ChecklistItem` carries no `rank`, `priority`, `order`, `weight` or `severity` —
 * measured, not assumed — so there is no field to sort by and the order items happen to
 * be generated in must not become the rule by accident. This list is therefore a written
 * claim that can be argued with, which is the point.
 *
 * **It ranks by lead time: what takes longest to obtain blocks hardest.** "The single
 * blocking item" is answering *what should this counsellor chase today*, and the answer
 * is never the quickest errand — it is the one whose clock has not started. Within a
 * stage, apply-stage rows always outrank lodge-stage ones, because after-offer evidence
 * cannot be obtained at all until an offer exists.
 */
export const BLOCKER_RANK_ORDER: readonly string[] = [
  // — Apply stage —
  // A passport is the precondition for everything else and Nepali issuance is its own
  // multi-week journey; the generator carries a whole how-to-start note for that reason.
  "passport",
  // A test has to be booked, sat and reported — weeks — and it gates both the program's
  // admission threshold and the visa's English floor.
  "english",
  // Funds need a documented, seasoned balance. It is the longest purely passive wait in
  // the case, and nothing a counsellor does can shorten it once it has started.
  "fin-bank",
  "fin-loan",
  "fin-sponsor",
  // Transcripts, plus a TU equivalence certificate that takes working days.
  "bachelors-transcript",
  "masters-transcript",
  // School certificates: usually already held, reissued locally when not.
  "plus-two",
  "slc-see",
  // A citizenship copy is at hand or certified quickly.
  "national-id",
  // Translations and certified copies are days, and they operate ON the documents above —
  // chasing them before the documents exist is out of order.
  "doc-preparation",

  // — Lodge stage —
  // Every other after-offer row waits on the offer.
  "offer-letter",
  "coe",
  // MoEST's process, and the bank needs it before it will release money.
  "noc-application",
  "medical",
  "biometrics",
  // Minutes online, and written answers — last, because they are the quickest.
  "oshc",
  "gs-responses",
];

const RANK = new Map(BLOCKER_RANK_ORDER.map((key, i) => [key, i]));

export interface ShortlistTierEntry {
  programId: string;
  status: ShortlistStatus;
}

/**
 * The program ids this read may be stated for, sorted so one case resolves to one
 * program on every render.
 */
export function preferredShortlistTier(
  shortlist: readonly ShortlistTierEntry[],
): readonly string[] {
  const applied = shortlist.filter((e) => e.status === "applied");
  const tier = applied.length > 0 ? applied : shortlist.filter((e) => e.status === "shortlisted");
  return tier.map((e) => e.programId).sort();
}

export interface SubmittabilityInputs {
  /** The catalogue rows for `preferredShortlistTier`'s ids. Absent ids are simply absent. */
  programs: readonly Program[];
  sections: ProfileSections;
  uploadedKinds: ReadonlySet<DocumentKind>;
  obtainedKinds: ReadonlySet<DocumentKind>;
  planStates: Record<string, LinkedPlanState>;
}

export function deriveSubmittability(input: SubmittabilityInputs): SubmittabilityRead {
  const programs = [...input.programs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (programs.length === 0) return { state: "no-program" };

  const checklists = programs.map((program) => itemsFor(program, input));
  const signature = (items: ChecklistItem[]) =>
    items
      .filter((it) => completion(it, input.planStates) !== null)
      .map((it) => `${it.stage}:${it.key}`)
      .sort()
      .join("|");
  const first = signature(checklists[0]!);
  if (checklists.some((items) => signature(items) !== first)) {
    return { state: "programs-differ", programCount: programs.length };
  }

  const program = programs[0]!;
  const items = checklists[0]!;
  const readiness = computeReadiness(items, input.planStates);
  const apply = stage(items, "now", readiness.now, input.planStates);
  const lodge = stage(items, "after-offer", readiness.afterOffer, input.planStates);

  return {
    state: "read",
    program: { id: program.id, name: program.name },
    alsoCovers: programs.length - 1,
    apply,
    lodge,
    blocker: rankedFirstOutstanding(apply.rows) ?? rankedFirstOutstanding(lodge.rows),
  };
}

/** The outstanding row this stage should be chased on, or null if there is none. */
function rankedFirstOutstanding(rows: readonly SubmittabilityRow[]): SubmittabilityRow | null {
  const outstanding = rows.filter((r) => !r.done);
  if (outstanding.length === 0) return null;
  // An unranked key sorts last rather than crashing a case overview; the coverage test
  // is what keeps that branch unreachable.
  const rankOf = (row: SubmittabilityRow) => RANK.get(row.key) ?? BLOCKER_RANK_ORDER.length;
  return [...outstanding].sort((a, b) => rankOf(a) - rankOf(b))[0]!;
}

/**
 * One stage's rollup. The COUNTS come from `computeReadiness` — this function is handed
 * them rather than adding them up, so there is exactly one denominator in the codebase.
 * Only the per-row detail is assembled here, from the same `completion` predicate, and a
 * test asserts `rows.length === total` so the two views can never disagree about which
 * rows are in the set.
 */
function stage(
  items: ChecklistItem[],
  which: ChecklistItem["stage"],
  counts: { ready: number; total: number },
  planStates: Record<string, LinkedPlanState>,
): StageSubmittability {
  const rows: SubmittabilityRow[] = [];
  for (const item of items) {
    if (item.stage !== which) continue;
    const done = completion(item, planStates);
    if (done === null) continue;
    rows.push({
      key: item.key,
      label: item.label,
      done,
      ...(item.source ? { source: item.source } : {}),
    });
  }
  return {
    ready: counts.ready,
    total: counts.total,
    complete: counts.total > 0 && counts.ready === counts.total,
    rows,
  };
}

function itemsFor(program: Program, input: SubmittabilityInputs): ChecklistItem[] {
  return generateChecklist({
    program,
    sections: input.sections,
    uploadedKinds: new Set(input.uploadedKinds),
    obtainedKinds: new Set(input.obtainedKinds),
  });
}
