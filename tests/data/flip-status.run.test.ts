import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DATA_MODULES } from "@/lib/data/schema/registry";
import { collectFindingRefs as collectImpl } from "../../docs/research-briefs/_tools/reconcile.js";
import { computeFlips as flipImpl } from "../../docs/research-briefs/_tools/flip-status.js";

/**
 * Write-mode runner for flip-status (mirrors the WRITE_GOLDENS pattern).
 *
 *   normal `vitest run`  → CI guard: the committed `used` set already matches the
 *                          code's findingRefs (nothing to promote/demote/refuse/rewire).
 *   FLIP_STATUS=1 ...     → derive the used set from code and rewrite findings/*.jsonl.
 *
 * The TS registry stays the single source of truth; this is the only place it is
 * bridged into the pure CJS flip core, so no standalone TS runner is needed.
 *
 * Regenerate after changing any module's findingRefs:
 *   FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts
 */

const WRITE = process.env.FLIP_STATUS === "1";
const FINDINGS_DIR = resolve(process.cwd(), "docs/research-briefs/findings");

type CodeRef = { recordPath: string; findingRefs: string[]; values: unknown[] };
type Finding = Record<string, unknown> & { id: string };
type Report = {
  promoted: string[];
  demoted: string[];
  refused: string[];
  refToRejected: string[];
  rewired: string[];
};
type Change = { status: string; used_by?: string[] };

const collectFindingRefs = collectImpl as unknown as (
  data: unknown,
  opts: { recordLabel: string; subRecordKeys: string[]; interface?: string; subInterface?: string },
) => CodeRef[];
const computeFlips = flipImpl as unknown as (a: {
  findings: Finding[];
  usedBy: Record<string, string[]>;
}) => { report: Report; changedById: Record<string, Change> };

/** id → recordPaths that reference it, across every registered module. */
function buildUsedBy(): Record<string, string[]> {
  const usedBy: Record<string, string[]> = {};
  for (const entry of DATA_MODULES) {
    const refs = collectFindingRefs(entry.data, {
      recordLabel: entry.recordLabel,
      subRecordKeys: entry.subRecordKeys,
      interface: entry.recordInterface,
      subInterface: entry.subRecordInterface,
    });
    for (const rec of refs) {
      for (const fid of rec.findingRefs) {
        (usedBy[fid] ??= []).push(rec.recordPath);
      }
    }
  }
  for (const k of Object.keys(usedBy)) usedBy[k] = [...new Set(usedBy[k])].sort();
  return usedBy;
}

function findingFiles(): string[] {
  return readdirSync(FINDINGS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
}

function loadAllFindings(): Finding[] {
  const out: Finding[] = [];
  for (const file of findingFiles()) {
    for (const line of readFileSync(resolve(FINDINGS_DIR, file), "utf8").split(/\r?\n/)) {
      if (line.trim()) out.push(JSON.parse(line) as Finding);
    }
  }
  return out;
}

/** Rewrite only the changed lines of each file; preserve EOL style, trailing newline, and untouched lines verbatim. */
function applyChanges(changedById: Record<string, Change>): number {
  let filesWritten = 0;
  for (const file of findingFiles()) {
    const path = resolve(FINDINGS_DIR, file);
    const raw = readFileSync(path, "utf8");
    const eol = raw.includes("\r\n") ? "\r\n" : "\n";
    const lines = raw.split(/\r?\n/);
    const trailingBlank = lines.length > 0 && lines[lines.length - 1] === "";
    const body = trailingBlank ? lines.slice(0, -1) : lines;
    const processed = body.map((line) => {
      if (!line.trim()) return line;
      const f = JSON.parse(line) as Finding;
      const ch = changedById[f.id];
      if (!ch) return line; // verbatim
      f.status = ch.status;
      if (ch.used_by) f.used_by = ch.used_by;
      else delete f.used_by;
      return JSON.stringify(f);
    });
    const result = processed.join(eol) + (trailingBlank ? eol : "");
    if (result !== raw) {
      writeFileSync(path, result, "utf8");
      filesWritten++;
    }
  }
  return filesWritten;
}

describe("flip-status derives the used set from code", () => {
  const usedBy = buildUsedBy();
  const findings = loadAllFindings();
  const { report, changedById } = computeFlips({ findings, usedBy });

  if (WRITE) {
    it("rewrites findings JSONL to match code refs (FLIP_STATUS=1)", () => {
      const filesWritten = applyChanges(changedById);
      console.log(
        `flip-status: files=${filesWritten} promoted=${report.promoted.length} ` +
          `demoted=${report.demoted.length} rewired=${report.rewired.length} ` +
          `refused=${report.refused.length} refToRejected=${report.refToRejected.length}`,
      );
    });
  } else {
    it("the committed used set already matches code (no promote/demote/refuse/rewire)", () => {
      const summary = JSON.stringify(report, null, 2);
      // Conflict + invented-value guards first — these are correctness failures.
      expect(report.refused, summary).toEqual([]);
      expect(report.refToRejected, summary).toEqual([]);
      // Then drift between code refs and finding status / used_by.
      expect(report.promoted, summary).toEqual([]);
      expect(report.demoted, summary).toEqual([]);
      expect(report.rewired, summary).toEqual([]);
    });
  }
});
