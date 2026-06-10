import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeTriageApplication as computeImpl,
  rewriteFindingsFile as rewriteImpl,
} from "../../docs/research-briefs/_tools/apply-triage.js";

type Finding = Record<string, unknown> & { id: string; status: string };
type Assignment = { id: string; triage: string; reason: string };
type Change = { triage: string; triage_reason: string };

const computeTriageApplication = computeImpl as unknown as (args: {
  findings: Finding[];
  assignments: Assignment[];
}) => { changedById: Record<string, Change>; errors: string[]; unchanged: string[] };

const rewriteFindingsFile = rewriteImpl as unknown as (
  path: string,
  changedById: Record<string, Change>,
) => boolean;

const pending = (id: string, extra: Record<string, unknown> = {}): Finding => ({
  id,
  status: "pending",
  claim: "x",
  ...extra,
});

describe("computeTriageApplication", () => {
  it("applies triage + reason to a pending finding", () => {
    const { changedById, errors } = computeTriageApplication({
      findings: [pending("A.001")],
      assignments: [{ id: "A.001", triage: "ready", reason: "gov-sourced, maps to checklist" }],
    });
    expect(errors).toEqual([]);
    expect(changedById).toEqual({
      "A.001": { triage: "ready", triage_reason: "gov-sourced, maps to checklist" },
    });
  });

  it("errors on an assignment to an unknown finding id", () => {
    const { errors, changedById } = computeTriageApplication({
      findings: [pending("A.001")],
      assignments: [{ id: "A.999", triage: "ready", reason: "r" }],
    });
    expect(errors.some((e) => e.includes("A.999"))).toBe(true);
    expect(changedById).toEqual({});
  });

  it("errors on an assignment to a non-pending finding", () => {
    const { errors, changedById } = computeTriageApplication({
      findings: [{ ...pending("A.001"), status: "used" }],
      assignments: [{ id: "A.001", triage: "ready", reason: "r" }],
    });
    expect(errors.some((e) => e.includes("non-pending"))).toBe(true);
    expect(changedById).toEqual({});
  });

  it("errors on an unknown triage value and an empty reason", () => {
    const { errors } = computeTriageApplication({
      findings: [pending("A.001"), pending("A.002")],
      assignments: [
        { id: "A.001", triage: "later-maybe", reason: "r" },
        { id: "A.002", triage: "ready", reason: "   " },
      ],
    });
    expect(errors.some((e) => e.includes("later-maybe"))).toBe(true);
    expect(errors.some((e) => e.includes("A.002"))).toBe(true);
  });

  it("errors on duplicate assignments for the same id", () => {
    const { errors } = computeTriageApplication({
      findings: [pending("A.001")],
      assignments: [
        { id: "A.001", triage: "ready", reason: "r1" },
        { id: "A.001", triage: "stale", reason: "r2" },
      ],
    });
    expect(errors.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("is idempotent: a finding already carrying the same triage is unchanged, not an error", () => {
    const already = pending("A.001", { triage: "ready", triage_reason: "r" });
    const { changedById, errors, unchanged } = computeTriageApplication({
      findings: [already],
      assignments: [{ id: "A.001", triage: "ready", reason: "r" }],
    });
    expect(errors).toEqual([]);
    expect(changedById).toEqual({});
    expect(unchanged).toEqual(["A.001"]);
  });

  it("leaves unassigned findings untouched", () => {
    const { changedById, errors } = computeTriageApplication({
      findings: [pending("A.001"), pending("A.002")],
      assignments: [{ id: "A.001", triage: "use-later", reason: "enumeration tail" }],
    });
    expect(errors).toEqual([]);
    expect(Object.keys(changedById)).toEqual(["A.001"]);
  });
});

describe("rewriteFindingsFile", () => {
  it("rewrites only assigned lines, preserves other lines byte-verbatim and keeps CRLF + trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "triage-"));
    const path = join(dir, "X.jsonl");
    try {
      const lineA = '{"id":"A.001","status":"pending","claim":"a","weird_spacing":  "kept"}';
      const lineB = '{"id":"A.002","status":"used","claim":"b"}';
      writeFileSync(path, `${lineA}\r\n${lineB}\r\n`, "utf8");

      const changed = rewriteFindingsFile(path, {
        "A.001": { triage: "stale", triage_reason: "fee figure from 2025" },
      });
      expect(changed).toBe(true);

      const raw = readFileSync(path, "utf8");
      const [first, second, tail] = raw.split("\r\n");
      expect(tail).toBe(""); // trailing newline + CRLF preserved
      expect(second).toBe(lineB); // untouched line byte-verbatim
      const parsed = JSON.parse(first);
      expect(parsed.triage).toBe("stale");
      expect(parsed.triage_reason).toBe("fee figure from 2025");
      expect(parsed.claim).toBe("a"); // other fields survive
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns false and leaves the file untouched when nothing in it changed", () => {
    const dir = mkdtempSync(join(tmpdir(), "triage-"));
    const path = join(dir, "X.jsonl");
    try {
      const raw = '{"id":"A.001","status":"pending"}\n';
      writeFileSync(path, raw, "utf8");
      expect(rewriteFindingsFile(path, {})).toBe(false);
      expect(readFileSync(path, "utf8")).toBe(raw);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
