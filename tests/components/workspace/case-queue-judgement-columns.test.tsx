import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { CaseQueueTable } from "@/components/workspace/case-queue-table";
import { sortQueue, type QueueCase } from "@/lib/cases/queue";
import type { SubmittabilityRead } from "@/lib/judgement/submittability";
import type { VisaRiskRead } from "@/lib/judgement/visa-risk";

/**
 * MV-200 criteria 4–5 — the two judgement columns, and sorting by them.
 *
 * The card is unusually strict about scope here: *"no design investment beyond sorting
 * numbers already computed"*, and the table's own comment already decided how an
 * unstateable read renders — *"forty rows of 'Coming soon' is worse than no column"*.
 * So most of what is asserted is restraint: no percentage, no bar, no colour on a row
 * that does not need attention, and no band at all on a case that could not be read.
 */

const ORG = "org-1";

function qc(id: string, over: Partial<QueueCase> = {}): QueueCase {
  return {
    id,
    displayName: `Student ${id}`,
    email: `${id}@example.test`,
    operationalStatus: "in_progress",
    hasLinkedStudent: true,
    archivedAt: null,
    updatedAt: "2026-08-01T00:00:00.000Z",
    assignment: { membershipId: "m-1", userId: "u-1", role: "counsellor", active: true },
    nextStep: { state: "caught-up", item: null, openCount: 0, waitingCount: 0 },
    lodgement: { state: "nothing-requested" },
    visaRisk: { state: "unavailable" },
    submittability: { state: "unavailable" },
    ...over,
  };
}

const band = (b: "strong" | "possible" | "reach"): VisaRiskRead => ({
  state: "read",
  band: b,
  conclusion: "…",
  blocker: null,
  factors: [],
  notHeld: [],
  ruleVersion: "1",
  configVersion: "1",
});

const evidence = (ready: number, total: number, blockerLabel?: string): SubmittabilityRead => ({
  state: "read",
  program: { id: "p-1", name: "Master of IT" },
  alsoCovers: 0,
  apply: { ready, total, complete: ready === total, rows: [] },
  lodge: { ready: 0, total: 7, complete: false, rows: [] },
  blocker: blockerLabel ? { key: "english", label: blockerLabel, done: false } : null,
});

const table = (rows: QueueCase[]) =>
  render(<CaseQueueTable rows={rows} organizationId={ORG} canAssign showAssignee />);

const rowFor = (id: string) =>
  within(screen.getByRole("link", { name: `Student ${id}` }).closest("tr")!);

describe("the judgement columns exist and are named", () => {
  it("adds Visa read and Evidence beside Lodgement", () => {
    table([qc("a")]);
    expect(screen.getByRole("columnheader", { name: "Visa read" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Evidence" })).toBeInTheDocument();
  });
});

describe("what each cell says", () => {
  it("states the band word, and the apply-stage count with the item blocking it", () => {
    table([qc("a", { visaRisk: band("reach"), submittability: evidence(2, 6, "IELTS scorecard") })]);
    const row = rowFor("a");
    expect(row.getByTestId("queue-visa-risk")).toHaveTextContent("Reach");
    // "to apply" is load-bearing: MV-199's criterion 7 forbids collapsing the two
    // stages, and a bare "2 of 6" in a column called Evidence reads as the whole case.
    expect(row.getByTestId("queue-evidence")).toHaveTextContent("2 of 6 to apply");
    expect(row.getByTestId("queue-evidence")).toHaveTextContent("IELTS scorecard");
  });

  it("says a case is fully evidenced without inventing a word for it", () => {
    table([qc("a", { submittability: evidence(6, 6) })]);
    expect(rowFor("a").getByTestId("queue-evidence")).toHaveTextContent("6 of 6 to apply");
  });

  it("renders NO band and NO count for a read that could not be made", () => {
    table([
      qc("a", { visaRisk: { state: "unavailable" }, submittability: { state: "unavailable" } }),
    ]);
    const row = rowFor("a");
    expect(row.getByTestId("queue-visa-risk")).toHaveTextContent("Couldn't check");
    expect(row.getByTestId("queue-evidence")).toHaveTextContent("Couldn't check");
    expect(row.queryByText(/Strong|Possible|Reach/)).toBeNull();
    expect(row.queryByText(/of \d/)).toBeNull();
  });

  it("keeps the three absences apart", () => {
    table([
      qc("a", {
        visaRisk: { state: "no-linked-student" },
        submittability: { state: "no-program" },
      }),
      qc("b", {
        visaRisk: { state: "insufficient-data" },
        submittability: { state: "programs-differ", programCount: 3 },
      }),
    ]);
    expect(rowFor("a").getByTestId("queue-visa-risk")).toHaveTextContent("No linked student");
    expect(rowFor("a").getByTestId("queue-evidence")).toHaveTextContent("No program");
    expect(rowFor("b").getByTestId("queue-visa-risk")).toHaveTextContent("Not enough recorded");
    expect(rowFor("b").getByTestId("queue-evidence")).toHaveTextContent("Programs differ");
  });
});

describe("restraint the card asked for", () => {
  it("colours ONLY the band that needs attention", () => {
    // The sibling Lodgement cell's rule, and for its reason: forty coloured rows is a
    // decorated table, not a scannable one. The WORD distinguishes Strong from Possible
    // in every row; the tint is reserved for the one a counsellor should stop at.
    table([
      qc("a", { visaRisk: band("reach") }),
      qc("b", { visaRisk: band("possible") }),
      qc("c", { visaRisk: band("strong") }),
    ]);
    expect(rowFor("a").getByTestId("queue-visa-risk").className).toContain("text-reach");
    expect(rowFor("b").getByTestId("queue-visa-risk").className).not.toContain("text-possible");
    expect(rowFor("c").getByTestId("queue-visa-risk").className).not.toContain("text-strong");
  });

  it("renders no percentage, no bar and no chart", () => {
    const { container } = table([
      qc("a", { visaRisk: band("possible"), submittability: evidence(2, 6, "Passport") }),
    ]);
    expect(container.textContent).not.toMatch(/%/);
    expect(container.querySelector("progress")).toBeNull();
    expect(container.querySelector("[role='progressbar']")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("sorting by each read", () => {
  // The MISTAKES.md vacuity rule, as `queue.test.ts` states it: assert on the RENDERED
  // ORDER of a whole list seeded out of order, never on "contains".
  const order = (rows: QueueCase[], sort: Parameters<typeof sortQueue>[1]) =>
    sortQueue(rows, sort).map((r) => r.id);

  it("visa risk sorts riskiest first, and an unreadable case LAST", () => {
    const rows = [
      qc("strong", { visaRisk: band("strong") }),
      qc("unknown", { visaRisk: { state: "no-linked-student" } }),
      qc("reach", { visaRisk: band("reach") }),
      qc("possible", { visaRisk: band("possible") }),
    ];
    // An unlinked case is not a low-risk one — it is no answer at all, and floating it
    // to the top of a risk sort would be a claim we have not earned.
    expect(order(rows, "visa-risk")).toEqual(["reach", "possible", "strong", "unknown"]);
  });

  it("evidence sorts furthest-from-submittable first, and an unreadable case last", () => {
    const rows = [
      qc("nearly", { submittability: evidence(5, 6) }),
      qc("none", { submittability: { state: "no-program" } }),
      qc("far", { submittability: evidence(1, 6) }),
      qc("done", { submittability: evidence(6, 6) }),
    ];
    expect(order(rows, "submittability")).toEqual(["far", "nearly", "done", "none"]);
  });

  it("a failed read leaves the order alone rather than inventing one", () => {
    // Every row compares equal when the batched read failed, so a stable sort keeps the
    // previous order. That is what makes the sort safe to offer without special-casing
    // the outage.
    const rows = [qc("c"), qc("a"), qc("b")];
    expect(order(rows, "visa-risk")).toEqual(["a", "b", "c"]);
  });
});
