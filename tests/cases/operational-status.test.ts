import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  isOperationalStatus,
  operationalStatusLabel,
} from "@/lib/cases/operational-status";

/**
 * The status vocabulary MV-170's filter offers, checked against the database
 * rather than against itself.
 *
 * A hand-copied enum agrees with the migration on the day it is written and
 * silently stops agreeing on the day the check constraint changes — at which
 * point the filter offers a value the database rejects, or hides one it accepts.
 * So the first test READS THE MIGRATION. It is the same discipline
 * `lib/cases/permissions.ts` states in prose ("the enum values below come from
 * the merged migration, never from a guess"), made mechanical.
 */

const MIGRATION = path.resolve(
  __dirname,
  "..",
  "..",
  "supabase",
  "migrations",
  "20260730120000_stage1_tenancy_core.sql",
);

/** The literals inside `check (operational_status in (…))`, in declaration order. */
function statusesInMigration(): string[] {
  // CRLF working tree: a newline-insensitive read is required either way, but
  // never split on "\n" alone — see tests/architecture/client-server-boundary.
  const sql = readFileSync(MIGRATION, "utf8").split(/\r?\n/).join("\n");
  const match = /check\s*\(\s*operational_status\s+in\s*\(([^)]*)\)\s*\)/i.exec(sql);
  const literals = match?.[1];
  if (literals === undefined) {
    throw new Error("operational_status check constraint not found in the migration");
  }
  return [...literals.matchAll(/'([^']*)'/g)]
    .map((literal) => literal[1])
    .filter((value): value is string => value !== undefined);
}

describe("OPERATIONAL_STATUSES", () => {
  test("is exactly the migration's check constraint, in the migration's order", () => {
    const fromMigration = statusesInMigration();

    // Non-vacuity: a regex that matched nothing would make the comparison below
    // trivially true against an empty constant.
    expect(fromMigration.length).toBeGreaterThan(1);
    expect([...OPERATIONAL_STATUSES]).toEqual(fromMigration);
  });

  test("every status carries a label, and no label is a raw database value", () => {
    for (const status of OPERATIONAL_STATUSES) {
      const label = OPERATIONAL_STATUS_LABELS[status];
      expect(label, status).toBeTruthy();
      // `waiting_on_student` rendered verbatim is a schema leak into the UI.
      expect(label, status).not.toContain("_");
    }
  });
});

describe("isOperationalStatus", () => {
  test("admits every value the constraint admits", () => {
    for (const status of OPERATIONAL_STATUSES) {
      expect(isOperationalStatus(status), status).toBe(true);
    }
  });

  test("refuses anything else, including a value shaped like one", () => {
    // The filter takes its value from the query string, so this is the guard that
    // stops a hand-edited URL from reaching the database as a predicate.
    for (const candidate of ["", "  ", "NEW", "in progress", "archived", "closed; drop"]) {
      expect(isOperationalStatus(candidate), candidate).toBe(false);
    }
  });

  test("refuses a non-string without throwing", () => {
    for (const candidate of [undefined, null, 3, {}, ["closed"]]) {
      expect(isOperationalStatus(candidate as unknown as string)).toBe(false);
    }
  });
});

describe("operationalStatusLabel", () => {
  test("renders the label for a known status", () => {
    expect(operationalStatusLabel("waiting_on_student")).toBe("Waiting on student");
  });

  test("falls back to the raw value when a migration has widened the constraint ahead of this file", () => {
    // `cases.operational_status` is typed `string`, not the union: the row comes
    // from the database. Showing nothing would be worse than showing the value —
    // a blank pill reads as "no status", which would be a lie about the record.
    expect(operationalStatusLabel("on_hold")).toBe("on_hold");
  });
});
