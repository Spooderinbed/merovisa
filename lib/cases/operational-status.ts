/**
 * The `cases.operational_status` vocabulary and the words a person reads for it.
 *
 * VALUES COME FROM THE MIGRATION, never from a guess: the check constraint at
 * `supabase/migrations/20260730120000_stage1_tenancy_core.sql:95-96` is the
 * source, and `tests/cases/operational-status.test.ts` parses that file rather
 * than restating the list, so a later migration that changes the constraint
 * turns the suite red instead of leaving a filter that offers a value the
 * database rejects.
 *
 * DELIBERATELY NOT `server-only`, unlike `./permissions.ts`. That module is
 * marked because a role→permission matrix is server business logic that must not
 * be readable in client JS. A status vocabulary is the opposite: it is what the
 * status pill and the filter say out loud. Marking it would only push a future
 * client component into re-declaring the strings, which is the drift this module
 * exists to prevent.
 */

export const OPERATIONAL_STATUSES = [
  "new",
  "in_progress",
  "waiting_on_student",
  "ready_for_review",
  "closed",
] as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

/** Sentence case, and never the raw column value — `waiting_on_student` is schema, not copy. */
export const OPERATIONAL_STATUS_LABELS: Record<OperationalStatus, string> = {
  new: "New",
  in_progress: "In progress",
  waiting_on_student: "Waiting on student",
  ready_for_review: "Ready for review",
  closed: "Closed",
};

/**
 * The guard between the query string and the database. A status filter arrives
 * as user input; anything the constraint does not admit is refused here rather
 * than sent as a predicate that can only ever match nothing.
 */
export function isOperationalStatus(value: unknown): value is OperationalStatus {
  return typeof value === "string" && (OPERATIONAL_STATUSES as readonly string[]).includes(value);
}

/**
 * The label, or the raw value when a later migration has widened the constraint
 * ahead of this file. `cases.operational_status` is typed `string` because the
 * row comes from the database; rendering nothing for an unknown value would read
 * as "no status", which is a lie about the record rather than an omission.
 */
export function operationalStatusLabel(value: string): string {
  return isOperationalStatus(value) ? OPERATIONAL_STATUS_LABELS[value] : value;
}
