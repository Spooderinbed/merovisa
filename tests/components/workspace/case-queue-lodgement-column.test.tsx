import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { CaseQueueTable } from "@/components/workspace/case-queue-table";
import type { QueueCase } from "@/lib/cases/queue";
import type { LodgementRead } from "@/lib/cases/lodgement";

/**
 * MV-183 — the Lodgement column on the Day view (spec §2, "Current and future
 * columns"): "Read word plus the single blocking item".
 *
 * The column is available because Stage 4 slice 1 shipped the data. What it may
 * say is bounded by that data and nothing more: outstanding document requests, one
 * named item, and no claim about whether the case can actually be lodged.
 */

const ORG = "org-1";

function qc(id: string, lodgement: LodgementRead, over: Partial<QueueCase> = {}): QueueCase {
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
    lodgement,
    ...over,
  };
}

function renderQueue(rows: QueueCase[]) {
  return render(
    <CaseQueueTable rows={rows} organizationId={ORG} canAssign showAssignee={false} />,
  );
}

const rowFor = (id: string) => screen.getByRole("row", { name: new RegExp(`Student ${id}`) });

describe("the Lodgement column", () => {
  it("has a column header", () => {
    renderQueue([qc("a", { state: "none-outstanding" })]);
    expect(screen.getByRole("columnheader", { name: "Lodgement" })).toBeTruthy();
  });

  it("shows the read word plus the single blocking item", () => {
    renderQueue([
      qc("a", {
        state: "blocked",
        blocker: { id: "r1", title: "Passport bio page", dueAt: "2026-08-20T00:00:00.000Z" },
        otherOutstanding: 2,
      }),
    ]);

    const row = within(rowFor("a"));
    expect(row.getByText("Blocked")).toBeTruthy();
    expect(row.getByText(/Passport bio page/)).toBeTruthy();
  });

  it("names ONE item, never a list, however many are outstanding", () => {
    const { container } = renderQueue([
      qc("a", {
        state: "blocked",
        blocker: { id: "r1", title: "Passport bio page", dueAt: null },
        otherOutstanding: 4,
      }),
    ]);
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("says Nothing outstanding when the batch found no outstanding request", () => {
    renderQueue([qc("a", { state: "none-outstanding" })]);
    expect(within(rowFor("a")).getByText("Nothing outstanding")).toBeTruthy();
  });

  it("presents a failed read as an outage, NEVER as nothing outstanding", () => {
    renderQueue([qc("a", { state: "unavailable" })]);

    const row = within(rowFor("a"));
    expect(row.getByText(/couldn't check/i)).toBeTruthy();
    expect(row.queryByText("Nothing outstanding")).toBeNull();
    expect(row.queryByText("Blocked")).toBeNull();
  });

  it("keeps one row's read off another row", () => {
    renderQueue([
      qc("a", {
        state: "blocked",
        blocker: { id: "r1", title: "Passport bio page", dueAt: null },
        otherOutstanding: 0,
      }),
      qc("b", { state: "none-outstanding" }),
    ]);

    expect(within(rowFor("a")).getByText("Blocked")).toBeTruthy();
    expect(within(rowFor("b")).queryByText("Blocked")).toBeNull();
    expect(within(rowFor("b")).getByText("Nothing outstanding")).toBeTruthy();
  });
});

describe("the Lodgement column — colour is never the only carrier", () => {
  const word = (read: LodgementRead) => {
    const { container, unmount } = renderQueue([qc("a", read)]);
    const el = container.querySelector("[data-lodgement-word]");
    const out = { cls: el?.getAttribute("class") ?? "", text: el?.textContent ?? "" };
    unmount();
    return out;
  };

  it("colours a blocked row Reach, and still writes the word", () => {
    const { cls, text } = word({
      state: "blocked",
      blocker: { id: "r1", title: "Passport bio page", dueAt: null },
      otherOutstanding: 0,
    });
    expect(cls).toContain("reach");
    expect(text).toBe("Blocked");
  });

  it("gives an unblocked row no verdict colour — the queue cannot earn Strong", () => {
    // The batched read fetches OUTSTANDING rows only, so it cannot tell a chased
    // case from an untouched one. A green row would claim the difference it does
    // not know.
    const { cls } = word({ state: "none-outstanding" });
    expect(cls).not.toContain("strong");
    expect(cls).not.toContain("possible");
    expect(cls).not.toContain("reach");
  });
});

describe("the Lodgement column — no completion claim", () => {
  const READS: LodgementRead[] = [
    { state: "blocked", blocker: { id: "r", title: "Bank statement", dueAt: null }, otherOutstanding: 7 },
    { state: "none-outstanding" },
    { state: "clear" },
    { state: "nothing-requested" },
    { state: "unavailable" },
  ];

  it("renders no percentage, denominator or progress element on any row", () => {
    for (const read of READS) {
      const { container, unmount } = renderQueue([qc("a", read)]);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/%|percent/i);
      expect(text).not.toMatch(/\b\d+\s*(of|\/)\s*\d+\b/);
      expect(container.querySelector("progress, meter")).toBeNull();
      expect(container.querySelector('[role="progressbar"], [aria-valuenow]')).toBeNull();
      unmount();
    }
  });

  it("never writes a word that claims the case is ready or verified", () => {
    for (const read of READS) {
      const { container, unmount } = renderQueue([qc("a", read)]);
      const text = container.querySelector("[data-lodgement-word]")?.textContent ?? "";
      expect(text.toLowerCase()).not.toMatch(/ready|verified|approved|submittable|lodge/);
      unmount();
    }
  });
});
