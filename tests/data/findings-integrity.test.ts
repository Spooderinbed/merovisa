import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateFinding } from "../../docs/research-briefs/_tools/finding-schema.js";
import { conflictGate as conflictGateImpl } from "../../docs/research-briefs/_tools/reconcile.js";

const conflictGate = conflictGateImpl as unknown as (findings: unknown[]) => string[];

const FINDINGS_DIR = resolve(process.cwd(), "docs/research-briefs/findings");

type Finding = {
  id: string;
  category: string;
  entity: string;
  attribute: string;
  status: string;
  value_status: string;
  conflict_with: string | string[] | null;
  cluster_triage?: string;
  [k: string]: unknown;
};

function loadAll(): Finding[] {
  const files = readdirSync(FINDINGS_DIR).filter((f) => f.endsWith(".jsonl"));
  const out: Finding[] = [];
  for (const f of files) {
    const text = readFileSync(resolve(FINDINGS_DIR, f), "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.trim()) out.push(JSON.parse(line));
    }
  }
  return out;
}

// Recompute entity+attribute cluster members exactly as build-ledger/extractor do.
function clusterMembers(findings: Finding[]): Finding[] {
  const groups: Record<string, Finding[]> = {};
  for (const f of findings) {
    const key = `${f.category}|${(f.entity || "").toLowerCase().trim()}|${(f.attribute || "").toLowerCase().trim()}`;
    (groups[key] ??= []).push(f);
  }
  const out: Finding[] = [];
  for (const [key, rs] of Object.entries(groups)) {
    const parts = key.split("|");
    if (rs.length >= 2 && (parts[1] || parts[2])) out.push(...rs);
  }
  return out;
}

const ALL = loadAll();

describe("findings integrity (all categories)", () => {
  it("every finding satisfies the canonical schema", () => {
    const bad = ALL.map((f) => ({ id: f.id, errors: validateFinding(f) })).filter((r) => r.errors.length);
    if (bad.length) {
      throw new Error(`schema-invalid findings:\n${bad.map((b) => `${b.id}: ${b.errors.join("; ")}`).join("\n")}`);
    }
    expect(bad).toEqual([]);
  });

  it("finding ids are globally unique", () => {
    const seen = new Map<string, number>();
    for (const f of ALL) seen.set(f.id, (seen.get(f.id) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    expect(dupes).toEqual([]);
  });

  it("no `used` finding is left value-unset (must be structured or prose-only)", () => {
    const offenders = ALL.filter((f) => f.status === "used" && f.value_status === "unset").map((f) => f.id);
    expect(offenders).toEqual([]);
  });

  it("every conflict_with points at an existing finding id", () => {
    const ids = new Set(ALL.map((f) => f.id));
    const dangling = ALL.flatMap((f) => {
      const cw = f.conflict_with;
      if (cw == null) return [];
      const partners = Array.isArray(cw) ? cw : [cw];
      return partners.filter((p) => !ids.has(p)).map((p) => `${f.id} -> ${p}`);
    });
    expect(dangling).toEqual([]);
  });

  it("no contradiction ships more than one used member (global conflict gate)", () => {
    expect(conflictGate(ALL)).toEqual([]);
  });

  it("every entity+attribute cluster member is triaged", () => {
    const untriaged = clusterMembers(ALL)
      .filter((f) => !f.cluster_triage)
      .map((f) => f.id);
    expect(untriaged).toEqual([]);
  });
});
