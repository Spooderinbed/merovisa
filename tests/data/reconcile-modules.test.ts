import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

function loadFindings(category: string): Array<Record<string, unknown>> {
  const p = resolve(process.cwd(), "docs/research-briefs/findings", `${category}.jsonl`);
  return readFileSync(p, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// The real-data proof gate: for every registered module, every `used` finding is
// referenced by code, every code ref resolves to a `used` finding, and every
// structured value actually matches the code. A drifted value fails here.
describe("registered data modules reconcile against their findings", () => {
  for (const entry of DATA_MODULES) {
    it(`${entry.category}: used findings are referenced, valid, and value-matched`, () => {
      const codeRefs = collectFindingRefs(entry.data, {
        recordLabel: entry.recordLabel,
        subRecordKeys: entry.subRecordKeys,
        interface: entry.recordInterface,
        subInterface: entry.subRecordInterface,
      });
      const findings = loadFindings(entry.category);
      const { errors, report } = reconcileCore({
        findings,
        codeRefs,
        exempt: { provenanceExemptInterfaces: entry.provenanceExemptInterfaces },
      });
      if (errors.length) {
        throw new Error(`reconcile failed for category ${entry.category}:\n${errors.join("\n")}`);
      }
      expect(errors).toEqual([]);
      expect(report.used).toBeGreaterThan(0);
    });
  }
});
