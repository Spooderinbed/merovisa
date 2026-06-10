import { describe, it, expect } from "vitest";
import { DATA_MODULES } from "@/lib/data/schema/registry";

/**
 * Freshness guard (memo: docs/audits/2026-06-10-data-governance-and-triage.md).
 *
 * A sourced record whose fact expires carries `reverifyBy` on its provenance —
 * set to the date the fact may change (e.g. DHA fees on the 1 July financial-
 * year boundary), not an arbitrary TTL. This suite goes red on that date: the
 * failure IS the re-verification reminder. Going red here is the designed
 * behavior — fix it by re-verifying the source and moving `reverifyBy`
 * (and `lastVerified`) forward, never by deleting the deadline.
 */

type Hit = { path: string; reverifyBy: string };

/** Recursively collect every provenance `reverifyBy` with a readable path. */
function collectReverify(node: unknown, path: string, out: Hit[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectReverify(v, `${path}[${i}]`, out));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === "provenance" && v && typeof v === "object") {
        const deadline = (v as { reverifyBy?: unknown }).reverifyBy;
        if (typeof deadline === "string") out.push({ path, reverifyBy: deadline });
      } else {
        collectReverify(v, `${path}.${k}`, out);
      }
    }
  }
}

/** ISO dates compare lexicographically; due on the written date, not after it. */
function dueForReverify(hits: Hit[], todayIso: string): Hit[] {
  return hits.filter((h) => h.reverifyBy <= todayIso);
}

describe("freshness guard mechanics", () => {
  const fixture = [
    {
      id: "fee",
      provenance: { findingRefs: ["A.001"], volatility: "annual", reverifyBy: "2026-07-01" },
      detail: {
        sub: { provenance: { findingRefs: ["A.002"], reverifyBy: "2026-01-01" } },
      },
    },
    { id: "stable-fact", provenance: { findingRefs: ["A.003"] } },
  ];

  it("collects reverifyBy deadlines from records and nested sub-records", () => {
    const hits: Hit[] = [];
    collectReverify(fixture, "FIXTURE", hits);
    expect(hits.map((h) => h.reverifyBy).sort()).toEqual(["2026-01-01", "2026-07-01"]);
    expect(hits.map((h) => h.path).sort()).toEqual(["FIXTURE[0]", "FIXTURE[0].detail.sub"]);
  });

  it("a deadline strictly in the future is not yet due", () => {
    expect(dueForReverify([{ path: "x", reverifyBy: "2026-07-01" }], "2026-06-30")).toEqual([]);
  });

  it("a deadline today or earlier is due — the guard goes red on the written date", () => {
    expect(dueForReverify([{ path: "x", reverifyBy: "2026-07-01" }], "2026-07-01")).toHaveLength(1);
    expect(dueForReverify([{ path: "x", reverifyBy: "2026-06-01" }], "2026-07-01")).toHaveLength(1);
  });
});

describe("freshness guard (every registered data module)", () => {
  it("no sourced record is past its reverifyBy date — re-verify the source, then move the deadline forward", () => {
    const today = new Date().toISOString().slice(0, 10);
    const hits: Hit[] = [];
    for (const m of DATA_MODULES) collectReverify(m.data, m.exportName, hits);
    const due = dueForReverify(hits, today).map((d) => `${d.path} (reverifyBy ${d.reverifyBy})`);
    expect(due).toEqual([]);
  });
});
