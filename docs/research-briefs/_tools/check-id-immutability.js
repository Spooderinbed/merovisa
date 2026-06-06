/**
 * Finding-id immutability guard.
 *
 * A finding id is a permanent handle: code records point at it via
 * provenance.findingRefs. Once committed, an id may never disappear or be
 * renumbered — retire a finding by setting status to `rejected:<reason>`
 * (which keeps the id), never by deleting or reusing it.
 *
 * This compares the working-tree finding ids against HEAD and fails if any
 * previously-committed id has vanished. Run in CI / pre-commit:
 *
 *   node docs/research-briefs/_tools/check-id-immutability.js
 *
 * Pure core (idDelta) is unit-tested; the git/fs wrapper is the CLI.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/** ids present in `committed` but missing from `current` (disappeared/renumbered). */
function idDelta(committed, current) {
  const com = new Set(committed);
  const cur = new Set(current);
  const missing = [...com].filter((id) => !cur.has(id));
  const added = [...new Set(current)].filter((id) => !com.has(id));
  return { missing, added };
}

/** Parse finding ids out of a JSONL blob, skipping blank lines. */
function idsFromJsonl(text) {
  const ids = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    ids.push(JSON.parse(line).id);
  }
  return ids;
}

function main() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const findingsDir = path.join(__dirname, "..", "findings");
  const files = fs.readdirSync(findingsDir).filter((f) => f.endsWith(".jsonl"));

  const committed = [];
  const current = [];
  for (const file of files) {
    const abs = path.join(findingsDir, file);
    current.push(...idsFromJsonl(fs.readFileSync(abs, "utf8")));
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    try {
      const blob = execSync(`git show HEAD:${rel}`, { cwd: repoRoot, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
      committed.push(...idsFromJsonl(blob));
    } catch {
      // file not in HEAD yet (newly added) — nothing committed to protect.
    }
  }

  const { missing, added } = idDelta(committed, current);
  if (missing.length) {
    console.error(`FAIL — ${missing.length} committed finding id(s) disappeared (delete/renumber is forbidden):`);
    console.error("  " + missing.join(", "));
    console.error("Retire findings via status `rejected:<reason>`, which keeps the id.");
    process.exit(1);
  }
  console.log(`OK — id immutability holds (${current.length} current, ${added.length} new since HEAD).`);
}

if (require.main === module) main();

module.exports = { idDelta, idsFromJsonl };
