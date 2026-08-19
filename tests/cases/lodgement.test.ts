import { describe, test, expect } from "vitest";

import {
  LODGEMENT_WORD,
  deriveLodgement,
  deriveQueueLodgement,
  selectLodgementBlocker,
  type LodgementRequestRow,
} from "@/lib/cases/lodgement";

/**
 * MV-183 — the pure half of the lodgement read (spec §2 "Current and future
 * columns", §3 "Submittability read").
 *
 * The whole product claim rests on two sentences: which case is blocked, and what
 * single item is blocking it. Both are derived here, from
 * `case_document_requests` rows and nothing else, so the queue column and the case
 * panel can never disagree about one case.
 *
 * THE HONESTY BOUNDARY IS THE POINT. Zero outstanding requests means nothing the
 * consultancy has ASKED FOR is outstanding. It does not mean the case is
 * submittable: no document has been verified by anyone, and the request list is
 * only as complete as the counsellor made it. So "all resolved" and "nothing was
 * ever asked for" are DIFFERENT states with different words — collapsing them
 * would put a reassuring word on a case nobody has started.
 */

const row = (over: Partial<LodgementRequestRow> = {}): LodgementRequestRow => ({
  id: "req-1",
  title: "Passport bio page",
  status: "outstanding",
  dueAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  ...over,
});

describe("selectLodgementBlocker — one item, chosen deterministically", () => {
  test("the earliest due_at wins", () => {
    const blocker = selectLodgementBlocker([
      row({ id: "late", title: "Bank statement", dueAt: "2026-09-01T00:00:00.000Z" }),
      row({ id: "soon", title: "Passport bio page", dueAt: "2026-08-20T00:00:00.000Z" }),
    ]);

    expect(blocker?.id).toBe("soon");
    expect(blocker?.title).toBe("Passport bio page");
  });

  test("a NULL due_at sorts last — an undated ask never outranks a dated one", () => {
    const blocker = selectLodgementBlocker([
      row({ id: "undated", title: "Sponsor letter", dueAt: null, createdAt: "2026-07-01T00:00:00.000Z" }),
      row({ id: "dated", title: "Bank statement", dueAt: "2026-12-31T00:00:00.000Z", createdAt: "2026-08-01T00:00:00.000Z" }),
    ]);

    expect(blocker?.id).toBe("dated");
  });

  test("created_at breaks a due_at tie — the oldest ask leads", () => {
    const blocker = selectLodgementBlocker([
      row({ id: "newer", dueAt: "2026-08-20T00:00:00.000Z", createdAt: "2026-08-05T00:00:00.000Z" }),
      row({ id: "older", dueAt: "2026-08-20T00:00:00.000Z", createdAt: "2026-08-02T00:00:00.000Z" }),
    ]);

    expect(blocker?.id).toBe("older");
  });

  test("created_at breaks a tie between two undated requests too", () => {
    const blocker = selectLodgementBlocker([
      row({ id: "newer", dueAt: null, createdAt: "2026-08-05T00:00:00.000Z" }),
      row({ id: "older", dueAt: null, createdAt: "2026-08-02T00:00:00.000Z" }),
    ]);

    expect(blocker?.id).toBe("older");
  });

  test("the id is the last tie-break, so the answer never depends on row order", () => {
    const a = row({ id: "aaa", dueAt: "2026-08-20T00:00:00.000Z", createdAt: "2026-08-02T00:00:00.000Z" });
    const b = row({ id: "bbb", dueAt: "2026-08-20T00:00:00.000Z", createdAt: "2026-08-02T00:00:00.000Z" });

    expect(selectLodgementBlocker([a, b])?.id).toBe("aaa");
    expect(selectLodgementBlocker([b, a])?.id).toBe("aaa");
  });

  test("a resolved request is never a blocker, however soon it was due", () => {
    const blocker = selectLodgementBlocker([
      row({ id: "done", status: "resolved", dueAt: "2026-08-01T00:00:00.000Z" }),
      row({ id: "open", status: "outstanding", dueAt: "2026-09-01T00:00:00.000Z" }),
    ]);

    expect(blocker?.id).toBe("open");
  });

  test("nothing outstanding means no blocker at all", () => {
    expect(selectLodgementBlocker([row({ status: "resolved" })])).toBeNull();
    expect(selectLodgementBlocker([])).toBeNull();
  });

  test("does not mutate the caller's array", () => {
    const rows = [
      row({ id: "late", dueAt: "2026-09-01T00:00:00.000Z" }),
      row({ id: "soon", dueAt: "2026-08-01T00:00:00.000Z" }),
    ];
    selectLodgementBlocker(rows);
    expect(rows.map((r) => r.id)).toEqual(["late", "soon"]);
  });
});

describe("deriveLodgement — the case panel's read, from the WHOLE request list", () => {
  test("one outstanding request blocks the case, naming that item", () => {
    const read = deriveLodgement([row({ id: "open", title: "Bank statement" })]);

    expect(read.state).toBe("blocked");
    if (read.state !== "blocked") return;
    expect(read.blocker.title).toBe("Bank statement");
    // The one named item is the whole of it — nothing else is outstanding.
    expect(read.otherOutstanding).toBe(0);
  });

  test("many outstanding requests still name exactly one, and count the rest", () => {
    const read = deriveLodgement([
      row({ id: "a", title: "Bank statement", dueAt: "2026-09-01T00:00:00.000Z" }),
      row({ id: "b", title: "Passport bio page", dueAt: "2026-08-20T00:00:00.000Z" }),
      row({ id: "c", title: "Sponsor letter", dueAt: null }),
      row({ id: "d", title: "Academic transcript", status: "resolved", dueAt: "2026-08-01T00:00:00.000Z" }),
    ]);

    expect(read.state).toBe("blocked");
    if (read.state !== "blocked") return;
    expect(read.blocker.title).toBe("Passport bio page");
    // Two others — the resolved one is not among them.
    expect(read.otherOutstanding).toBe(2);
  });

  test("every request resolved is 'clear' — asked for and arrived", () => {
    const read = deriveLodgement([
      row({ id: "a", status: "resolved" }),
      row({ id: "b", status: "resolved" }),
    ]);

    expect(read.state).toBe("clear");
  });

  test("no requests at all is NOT 'clear' — nobody has asked for anything", () => {
    // The honesty boundary in one assertion: an untouched case must not borrow the
    // word a fully-chased case earned.
    expect(deriveLodgement([]).state).toBe("nothing-requested");
  });
});

describe("deriveQueueLodgement — the queue column, from OUTSTANDING rows only", () => {
  test("outstanding rows block, naming the same single item the panel names", () => {
    const outstanding = [
      row({ id: "a", title: "Bank statement", dueAt: "2026-09-01T00:00:00.000Z" }),
      row({ id: "b", title: "Passport bio page", dueAt: "2026-08-20T00:00:00.000Z" }),
    ];

    const queue = deriveQueueLodgement(outstanding);
    const panel = deriveLodgement(outstanding);

    expect(queue.state).toBe("blocked");
    if (queue.state !== "blocked" || panel.state !== "blocked") return;
    expect(queue.blocker.title).toBe(panel.blocker.title);
    expect(queue.otherOutstanding).toBe(1);
  });

  test("no outstanding rows is 'none-outstanding', never 'clear'", () => {
    // The queue reads OUTSTANDING rows only, so it cannot know whether anything was
    // ever requested. It says the weaker true thing rather than guessing the
    // stronger one.
    expect(deriveQueueLodgement([]).state).toBe("none-outstanding");
  });
});

describe("LODGEMENT_WORD — the read word, and what it is careful not to claim", () => {
  test("blocked is the only alarming word", () => {
    expect(LODGEMENT_WORD.blocked).toBe("Blocked");
  });

  test("a fully-chased case says what is true of the REQUESTS, not of the case", () => {
    // Not "Ready to lodge": nothing here verified a document, and the request list
    // is only as complete as the counsellor made it.
    expect(LODGEMENT_WORD.clear).toBe("Nothing outstanding");
  });

  test("an unasked case says so in its own words", () => {
    expect(LODGEMENT_WORD["nothing-requested"]).toBe("Nothing requested yet");
  });

  test("the queue's weaker state shares the word it is entitled to", () => {
    // Same sentence as `clear`, because it is equally true and no more.
    expect(LODGEMENT_WORD["none-outstanding"]).toBe("Nothing outstanding");
  });

  test("no word anywhere claims the case is submittable, ready, or verified", () => {
    for (const word of Object.values(LODGEMENT_WORD)) {
      expect(word.toLowerCase()).not.toMatch(/ready|verified|approved|complete|submittable|lodge/);
    }
  });
});
