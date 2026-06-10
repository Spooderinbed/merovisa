#!/usr/bin/env node
/**
 * Slice-kit: apply human-reviewed triage assignments to findings/*.jsonl.
 *
 * The human-owned side of the ownership split (memo:
 * docs/audits/2026-06-10-data-governance-and-triage.md): flip-status.js owns
 * `status` (machine-derived from code refs); this tool writes only `triage` +
 * `triage_reason`, and only onto `pending` findings. It never touches claim,
 * source, value, status, or used_by, and rewrites only the lines it changes
 * (EOL style, trailing newline, and untouched lines preserved verbatim —
 * the same discipline as the FLIP_STATUS runner).
 *
 * Usage:
 *   node apply-triage.js <report.json> [more.json ...] [--dry-run]
 *
 * Each report is {"assignments":[{"id","triage","reason"}...]} (a category
 * agent's output), an array of such reports, or a bare assignments array.
 * Any validation error aborts the whole run before a single write.
 */

const fs = require("fs");
const path = require("path");
const { TRIAGE } = require("./finding-schema.js");

/**
 * Validate assignments against the loaded findings. Returns changes keyed by
 * finding id, plus errors (any error = do not write) and the ids whose triage
 * already matched (idempotent re-runs).
 */
function computeTriageApplication({ findings, assignments }) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const errors = [];
  const changedById = {};
  const unchanged = [];
  const seen = new Set();

  for (const a of assignments) {
    if (seen.has(a.id)) {
      errors.push(`duplicate assignment for ${a.id}`);
      continue;
    }
    seen.add(a.id);
    const f = byId.get(a.id);
    if (!f) {
      errors.push(`unknown finding id ${a.id}`);
      continue;
    }
    if (f.status !== "pending") {
      errors.push(`assignment to non-pending ${a.id} (status ${JSON.stringify(f.status)})`);
      continue;
    }
    if (!TRIAGE.has(a.triage)) {
      errors.push(`bad triage ${JSON.stringify(a.triage)} for ${a.id}`);
      continue;
    }
    if (typeof a.reason !== "string" || !a.reason.trim()) {
      errors.push(`empty reason for ${a.id}`);
      continue;
    }
    if (f.triage === a.triage && f.triage_reason === a.reason) {
      unchanged.push(a.id);
      continue;
    }
    changedById[a.id] = { triage: a.triage, triage_reason: a.reason };
  }

  return { changedById, errors, unchanged };
}

/** Rewrite one findings file in place. Returns true when the file changed. */
function rewriteFindingsFile(filePath, changedById) {
  const raw = fs.readFileSync(filePath, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);
  const trailingBlank = lines.length > 0 && lines[lines.length - 1] === "";
  const body = trailingBlank ? lines.slice(0, -1) : lines;
  const processed = body.map((line) => {
    if (!line.trim()) return line;
    const f = JSON.parse(line);
    const ch = changedById[f.id];
    if (!ch) return line; // verbatim
    f.triage = ch.triage;
    f.triage_reason = ch.triage_reason;
    return JSON.stringify(f);
  });
  const result = processed.join(eol) + (trailingBlank ? eol : "");
  if (result === raw) return false;
  fs.writeFileSync(filePath, result, "utf8");
  return true;
}

/** Accept a category report, an array of reports, or a bare assignments array. */
function extractAssignments(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((p) => (p && Array.isArray(p.assignments) ? p.assignments : [p]));
  }
  if (parsed && Array.isArray(parsed.assignments)) return parsed.assignments;
  throw new Error("unrecognized report shape — expected assignments");
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const inputs = argv.filter((a) => a !== "--dry-run");
  if (inputs.length === 0) {
    console.error("usage: node apply-triage.js <report.json> [more.json ...] [--dry-run]");
    process.exit(2);
  }

  const assignments = inputs.flatMap((p) =>
    extractAssignments(JSON.parse(fs.readFileSync(p, "utf8"))),
  );

  const findingsDir = path.resolve(__dirname, "..", "findings");
  const files = fs
    .readdirSync(findingsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .map((f) => path.join(findingsDir, f));
  const findings = files.flatMap((f) =>
    fs
      .readFileSync(f, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l)),
  );

  const { changedById, errors, unchanged } = computeTriageApplication({ findings, assignments });
  if (errors.length) {
    console.error(`REFUSED — ${errors.length} validation error(s), nothing written:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const counts = {};
  for (const ch of Object.values(changedById)) counts[ch.triage] = (counts[ch.triage] || 0) + 1;
  const summary = Object.entries(counts)
    .map(([k, n]) => `${k}=${n}`)
    .join(" ");

  if (dryRun) {
    console.log(`dry-run: would apply ${Object.keys(changedById).length} (${summary}); unchanged=${unchanged.length}`);
    return;
  }

  let filesWritten = 0;
  for (const f of files) if (rewriteFindingsFile(f, changedById)) filesWritten++;
  console.log(
    `applied ${Object.keys(changedById).length} triage assignment(s) (${summary}); unchanged=${unchanged.length}; files=${filesWritten}`,
  );
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { computeTriageApplication, rewriteFindingsFile, extractAssignments };
