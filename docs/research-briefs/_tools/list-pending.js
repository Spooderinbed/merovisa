#!/usr/bin/env node
/**
 * Slice-kit: see what's left to integrate, by category and by leverage.
 *
 * Pure core (summarize, pendingInCategory, classify) + a thin CLI runner. No deps.
 *
 *   node docs/research-briefs/_tools/list-pending.js          # per-category status table
 *   node docs/research-briefs/_tools/list-pending.js A        # detail: A's pending findings
 *   node docs/research-briefs/_tools/list-pending.js A --data # only claim_type:"data" rows
 *
 * Reads findings/*.jsonl (the post-extraction source of truth). Strictly read-only.
 * `pendingData` (pending claim_type:"data") is the structured-value surface — the
 * findings most likely to carry a number a verdict depends on, so the best place
 * to point the next slice.
 */

function classify(status) {
  if (status === "used") return "used";
  if (typeof status === "string" && status.startsWith("rejected:")) return "rejected";
  return "pending"; // "pending" (and any not-yet-resolved status) counts as work remaining
}

/** Per-category + total status breakdown. */
function summarize(findings) {
  const summary = { total: 0, used: 0, pending: 0, rejected: 0, byCategory: {} };
  for (const f of findings) {
    const cat = f.category;
    const c = (summary.byCategory[cat] = summary.byCategory[cat] || {
      total: 0,
      used: 0,
      pending: 0,
      rejected: 0,
      pendingData: 0,
    });
    const bucket = classify(f.status);
    summary.total++;
    c.total++;
    summary[bucket]++;
    c[bucket]++;
    if (bucket === "pending" && f.claim_type === "data") c.pendingData++;
  }
  return summary;
}

/** The pending findings of one category, with the fields a human needs to integrate them. */
function pendingInCategory(findings, category) {
  return findings
    .filter((f) => f.category === category && classify(f.status) === "pending")
    .map((f) => ({
      id: f.id,
      claim_type: f.claim_type,
      value_type: f.value_type,
      value_status: f.value_status,
      claim: f.claim,
    }));
}

module.exports = { summarize, pendingInCategory, classify };

// ---- CLI -------------------------------------------------------------------
if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const FINDINGS_DIR = path.resolve(__dirname, "..", "findings");

  const findings = [];
  for (const file of fs.readdirSync(FINDINGS_DIR).filter((f) => f.endsWith(".jsonl")).sort()) {
    for (const line of fs.readFileSync(path.join(FINDINGS_DIR, file), "utf8").split(/\r?\n/)) {
      if (line.trim()) findings.push(JSON.parse(line));
    }
  }

  const args = process.argv.slice(2);
  const dataOnly = args.includes("--data");
  const categoryArg = args.find((a) => /^[A-J]\d*$/i.test(a));

  if (!categoryArg) {
    const s = summarize(findings);
    console.log(`findings: ${s.total} · used=${s.used} · pending=${s.pending} · rejected=${s.rejected}\n`);
    console.log("cat | pending | pend.data | used | rejected | total");
    console.log("----|---------|-----------|------|----------|------");
    for (const cat of Object.keys(s.byCategory).sort()) {
      const c = s.byCategory[cat];
      console.log(
        `${cat.padEnd(3)} | ${String(c.pending).padStart(7)} | ${String(c.pendingData).padStart(9)} | ` +
          `${String(c.used).padStart(4)} | ${String(c.rejected).padStart(8)} | ${String(c.total).padStart(5)}`,
      );
    }
    console.log("\nPass a category (e.g. `A`) to list its pending findings; add `--data` for data-claims only.");
  } else {
    const category = categoryArg.toUpperCase();
    let rows = pendingInCategory(findings, category);
    if (dataOnly) rows = rows.filter((r) => r.claim_type === "data");
    console.log(`${category} pending${dataOnly ? " (data only)" : ""}: ${rows.length}\n`);
    for (const r of rows) {
      const tag =
        r.value_status === "structured"
          ? `[${r.value_type}]`
          : r.claim_type === "data"
            ? "[data·unset]"
            : `[${r.claim_type}]`;
      const claim = r.claim && r.claim.length > 100 ? r.claim.slice(0, 99) + "…" : r.claim || "";
      console.log(`${r.id} ${tag.padEnd(14)} ${claim}`);
    }
  }
}
