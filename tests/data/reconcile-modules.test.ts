import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_MODULES } from "@/lib/data/schema/registry";
import {
  reconcileCore as reconcileCoreImpl,
  collectFindingRefs as collectFindingRefsImpl,
} from "../../docs/research-briefs/_tools/reconcile.js";

// reconcile.js is untyped CJS; annotate the real fns so strict TS sees the shapes.
type CodeRef = { recordPath: string; interface?: string; findingRefs: string[]; values: unknown[] };
type ReconcileResult = { errors: string[]; report: { total: number; used: number; referenced: number } };
const reconcileCore = reconcileCoreImpl as unknown as (a: {
  findings: unknown[];
  codeRefs: unknown[];
  exempt?: { provenanceExemptInterfaces?: string[]; findingExemptIds?: string[] };
}) => ReconcileResult;
const collectFindingRefs = collectFindingRefsImpl as unknown as (
  data: unknown,
  opts: { recordLabel: string; subRecordKeys: string[]; interface?: string; subInterface?: string },
) => CodeRef[];

const FINDINGS_DIR = resolve(process.cwd(), "docs/research-briefs/findings");

// All findings, every category. IDs are globally unique, so reconciling the union
// of all module refs against the union of all findings is correct — and it lets a
// single value cite corroborating findings from more than one category
// (e.g. the DHA living figure is both A.015 and B.002).
function loadAllFindings(): Array<Record<string, unknown>> {
  return readdirSync(FINDINGS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .flatMap((f) =>
      readFileSync(resolve(FINDINGS_DIR, f), "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
    );
}

// The real-data proof gate, run globally: every `used` finding (any category) is
// referenced by some registered module, every code ref resolves to a `used`
// finding, every structured value matches the code, and no `used` finding sits in
// an open contradiction. A drifted, orphaned, or premature value fails here.
describe("registered data modules reconcile against the findings (global)", () => {
  it("every used finding is referenced; every ref is used + value-matched; no open conflict", () => {
    const codeRefs = DATA_MODULES.flatMap((entry) =>
      collectFindingRefs(entry.data, {
        recordLabel: entry.recordLabel,
        subRecordKeys: entry.subRecordKeys,
        interface: entry.recordInterface,
        subInterface: entry.subRecordInterface,
      }),
    );
    const findings = loadAllFindings();
    const provenanceExemptInterfaces = [
      ...new Set(DATA_MODULES.flatMap((e) => e.provenanceExemptInterfaces ?? [])),
    ];
    const { errors, report } = reconcileCore({
      findings,
      codeRefs,
      exempt: { provenanceExemptInterfaces },
    });
    if (errors.length) {
      throw new Error(`reconcile failed:\n${errors.join("\n")}`);
    }
    expect(errors).toEqual([]);
    expect(report.used).toBeGreaterThan(0);
  });
});
