#!/usr/bin/env node
/**
 * Deterministic extractor: Research Documents/*.md (atomic findings tables)
 *   -> docs/research-briefs/raw-results/<cat>.md   (verbatim intake copy)
 *   -> docs/research-briefs/findings/<cat>.jsonl    (one finding per line)
 *
 * Lossless: every table row becomes exactly one JSONL line. No inference.
 * Preserves integration state (status/used_by) from any existing JSONL.
 * The findings-ledger.md / findings-clusters.md views are generated separately
 * by _tools/build-ledger.js (run that after this).
 * Run: node docs/research-briefs/_tools/extract-findings.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "Research Documents");
const RAW = path.join(ROOT, "docs", "research-briefs", "raw-results");
const OUT = path.join(ROOT, "docs", "research-briefs", "findings");

// Primary integration target per category (refined per-finding at integration time).
const TARGET = {
  A: "lib/documents/types.ts (+ plan rules)",
  B: "lib/data/source/nepal-banks.ts (+ finance)",
  C: "lib/data/destination/australia-visa-classes.ts (+ journey/visa-lodge)",
  D: "supabase seed_universities migration",
  E: "lib/data/programs seed (+ course-career)",
  F: "app/(app)/journey GS/SOP/rec-letters content",
  G: "app/(app)/journey/working-with-agents",
  H: "app/(app)/journey pre-departure/post-arrival/working",
  I: "app/(app)/journey/refusal-recovery (+ plan rules)",
  J: "lib/data/source/nepal.ts tests (+ scholarships)",
};

const SENT = "<<PIPE>>";
function splitCells(line) {
  // protect escaped pipes (\|), split on real pipes, restore
  let s = line.split("\\|").join(SENT).trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.split(SENT).join("|").trim());
}

function isSep(cells) {
  return cells.every((c) => /^[-: ]*$/.test(c));
}

const COLS = ["id", "claim", "entity", "attribute", "source", "publisher", "source_date", "confidence", "type", "caveats"];

[RAW, OUT].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const files = fs.readdirSync(SRC).filter((f) => /^[A-J]\.md$/.test(f)).sort();
const all = [];
const perCat = {};

for (const f of files) {
  const cat = f[0];
  const txt = fs.readFileSync(path.join(SRC, f), "utf8");
  fs.writeFileSync(path.join(RAW, f), txt); // verbatim intake copy

  const reported = (txt.match(/Total findings:\s*(\d+)/) || [])[1];
  const rows = [];
  for (const ln of txt.split(/\r?\n/)) {
    if (!ln.trim().startsWith("|")) continue;
    const cells = splitCells(ln);
    if (cells.length < 10) continue;
    if (cells[0].toLowerCase() === "id") continue;
    if (isSep(cells)) continue;
    const o = {};
    COLS.forEach((c, i) => (o[c] = cells[i] || ""));
    const m = o.id.match(/^([A-Za-z]+\d*)\./);
    const finding = {
      id: o.id,
      topic: m ? m[1] : cat,
      category: cat,
      claim: o.claim,
      entity: o.entity,
      attribute: o.attribute,
      source: o.source,
      publisher: o.publisher,
      source_date: o.source_date,
      confidence: o.confidence.toLowerCase(),
      claim_type: o.type.toLowerCase(),
      caveats: o.caveats,
      target: TARGET[cat],
      conflict_with: null,
      dup_group: null,
      status: "pending",
    };
    rows.push(finding);
    all.push(finding);
  }
  perCat[cat] = { rows, reported: reported ? +reported : null };
}

// dup / conflict detection: same category + entity + attribute
const groups = {};
for (const r of all) {
  const key = r.category + "|" + r.entity.toLowerCase().trim() + "|" + r.attribute.toLowerCase().trim();
  (groups[key] = groups[key] || []).push(r);
}
let gid = 0;
const collisions = [];
for (const [key, rs] of Object.entries(groups)) {
  if (rs.length < 2) continue;
  const parts = key.split("|");
  if (!parts[1] && !parts[2]) continue; // skip empty entity+attr
  gid++;
  const claims = new Set(rs.map((r) => r.claim.trim()));
  rs.forEach((r) => (r.dup_group = "G" + gid));
  collisions.push({ gid: "G" + gid, key, rows: rs, differ: claims.size > 1 });
}

// write JSONL — preserve integration state (status/used_by) from any existing file
for (const cat of Object.keys(perCat)) {
  const prevPath = path.join(OUT, cat + ".jsonl");
  const prev = {};
  if (fs.existsSync(prevPath)) {
    for (const line of fs.readFileSync(prevPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const p = JSON.parse(line);
      prev[p.id] = p;
    }
  }
  for (const r of perCat[cat].rows) {
    const p = prev[r.id];
    if (p) {
      r.status = p.status || r.status;
      if (p.used_by) r.used_by = p.used_by;
    }
  }
  const jsonl = perCat[cat].rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(prevPath, jsonl);
}

// derive cluster review counts for the stdout summary
const needReview = collisions.filter((c) => c.differ);

// stdout summary (derived answer only)
console.log("category  rows  reported  jsonlLines  parity");
let okAll = true;
for (const cat of Object.keys(perCat).sort()) {
  const { rows, reported } = perCat[cat];
  const lines = fs.readFileSync(path.join(OUT, cat + ".jsonl"), "utf8").trim().split("\n").length;
  const ok = rows.length === reported && rows.length === lines;
  if (!ok) okAll = false;
  console.log(`${cat.padEnd(9)}${String(rows.length).padStart(4)}${String(reported).padStart(10)}${String(lines).padStart(12)}  ${ok ? "OK" : "FAIL"}`);
}
console.log("-".repeat(45));
console.log(`TOTAL ${all.length} findings · entity+attr clusters ${collisions.length} (multi-valued ${needReview.length}) · end-to-end parity ${okAll ? "OK" : "FAIL"}`);
console.log("wrote: raw-results/*.md, findings/*.jsonl (run build-ledger.js to regenerate the ledger views)");
