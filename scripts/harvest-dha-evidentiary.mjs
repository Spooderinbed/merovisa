#!/usr/bin/env node
/**
 * Harvest the DHA Document Checklist Tool (a.k.a. Web Evidentiary Tool) into the
 * two sourced datasets MyVisa consumes:
 *
 *   lib/data/source/au-cricos-directory.ts     — the complete CRICOS provider directory
 *   lib/data/source/au-nepal-evidence-levels.ts — per-provider Nepal evidence levels
 *
 * The tool is a SharePoint-hosted page whose data comes from two anonymous JSON
 * endpoints (no cookie / CSRF / form digest required, verified 2026-06-22):
 *
 *   POST /_layouts/15/api/Termstore.aspx/GetTermsByProperty
 *        { groupName: "IMMI", termSetName: "CRICOS" | "CountriesOfPassport", propertyName: "Code" }
 *     → { d: { data: [ { Key, Value }, ... ] } }   (provider name → code; country → ISO3)
 *
 *   POST /_layouts/15/api/ESB.aspx/GetStudentDocumentChecklistType
 *        { countryPassport, provider, cricosCode, studentEvidenceStudyTypeCode }
 *     → { d: { success, data: [ { studentResult } ] } }   (studentResult ∈ Regular|Streamlined|Undetermined)
 *
 * These are INTERNAL SharePoint endpoints, not a published API: DHA may add a gate
 * at any time, and a burst of requests trips a transient HTTP 403 rate limit. This
 * script is a POLITE, RESUMABLE periodic batch job — concurrency 2, jitter, and
 * exponential backoff on 403/429/5xx. It is NOT a runtime dependency.
 *
 * Licensing: DHA content is CC BY 3.0 AU (attribute the Commonwealth of Australia,
 * Department of Home Affairs). robots.txt does not disallow these paths.
 *
 * Usage:  node scripts/harvest-dha-evidentiary.mjs
 * Resumes from .harvest-cache/ in the repo root; delete it to force a clean run.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(REPO, ".harvest-cache");
const BASE = "https://immi.homeaffairs.gov.au";
const COUNTRY = "NPL"; // Nepal — the MVP corridor
const STUDY_TYPE = "01"; // "all other students" (mainstream degree-seekers)
const UA = "Mozilla/5.0 (MyVisa Nepal-Australia data harvest; periodic batch)";
const TOOL = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (path, body) =>
  fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", "User-Agent": UA },
    body: JSON.stringify(body),
  });

// One CRICOS code that the term store ships malformed (dropped leading zero).
const normalize = (code) => (code === "3522E" ? "03522E" : code);

async function evidenceCall(code) {
  let wait = 1200;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await post("/_layouts/15/api/ESB.aspx/GetStudentDocumentChecklistType", {
        countryPassport: COUNTRY,
        provider: code,
        cricosCode: code,
        studentEvidenceStudyTypeCode: STUDY_TYPE,
      });
      if (r.status === 200 && (r.headers.get("content-type") || "").includes("json")) {
        const d = (await r.json()).d;
        if (d && d.success && d.data && d.data[0]) return d.data[0].studentResult;
        return null; // endpoint replied but no level (treated as not-harvested)
      }
      if (r.status === 403 || r.status === 429 || r.status >= 500) {
        await sleep(wait);
        wait = Math.min(wait * 2, 15000);
        continue;
      }
      return null;
    } catch {
      await sleep(wait);
      wait = Math.min(wait * 2, 15000);
    }
  }
  return null; // exhausted retries — left for the next resume
}

function tsString(s) {
  return JSON.stringify(s);
}

function directoryFile(providers, date) {
  const rows = providers
    .map((p) => `  [${tsString(p.name)}, ${tsString(normalize(p.code))}],`)
    .join("\n");
  return `import type { AuCricosDirectoryEntry } from "@/lib/data/types";

/**
 * Complete CRICOS provider directory — every Australian education provider listed
 * in DHA's Document Checklist Tool (a.k.a. Web Evidentiary Tool), harvested from
 * the tool's public term-store endpoint:
 *   POST /_layouts/15/api/Termstore.aspx/GetTermsByProperty
 *        { groupName: "IMMI", termSetName: "CRICOS", propertyName: "Code" }
 * (Key = provider name, Value = CRICOS provider code).
 *
 * This is the authority-sourced superset of the hand-curated, finding-traced
 * lib/data/source/au-cricos-codes.ts (which stays the curated, per-finding subset).
 * DISPLAY-data provenance: a module-level source + one harvest date (one authority,
 * one batch — the au-oshc-premiums.ts pattern), deliberately OUTSIDE the findings
 * ledger. No scorer reads it; it is not a per-finding research value.
 *
 * Source: DHA Document Checklist Tool — Commonwealth of Australia (Department of
 * Home Affairs), licensed CC BY 3.0 AU. Re-harvestable via
 * scripts/harvest-dha-evidentiary.mjs. Internal SharePoint endpoints: treat as a
 * periodic batch, never a live dependency.
 *
 * Data note: the term store lists "Babel International College" under "3522E" (a
 * dropped leading zero); normalised here to the true register code "03522E"
 * (verified at bic.wa.edu.au). All other codes are the source values verbatim.
 */
export const AU_CRICOS_DIRECTORY_SOURCE =
  ${tsString(TOOL)};
export const AU_CRICOS_DIRECTORY_VERIFIED = ${tsString(date)};

// [provider, cricosCode] — compact source tuples, mapped to typed records below.
const RAW: [string, string][] = [
${rows}
];

export const AU_CRICOS_DIRECTORY: AuCricosDirectoryEntry[] = RAW.map(
  ([provider, cricosCode]) => ({ provider, cricosCode }),
);
`;
}

function evidenceFile(codes, evidence, date) {
  const dist = {};
  const rows = codes
    .map((c) => {
      const lvl = evidence[c];
      dist[lvl] = (dist[lvl] || 0) + 1;
      return `  ${tsString(c)}: ${tsString(lvl)},`;
    })
    .join("\n");
  return `/**
 * Per-provider Nepal evidence-level map. For a Nepalese passport holder applying
 * as a mainstream student (study-type "01" — "all other students"), the DHA
 * Document Checklist Tool's evidence level at each CRICOS provider: "Streamlined"
 * (reduced documentary expectations) or "Regular" (standard). Harvested for every
 * unique CRICOS code in the provider directory from the tool's checklist endpoint:
 *   POST /_layouts/15/api/ESB.aspx/GetStudentDocumentChecklistType
 *        { countryPassport: "NPL", provider: <code>, cricosCode: <code>,
 *          studentEvidenceStudyTypeCode: "01" }
 * → d.data[0].studentResult. The framework's third level "Undetermined" is retained
 * in the type as a value the source can return.
 *
 * Keyed by CRICOS code (provider names live in au-cricos-directory.ts). DISPLAY
 * data: module-level source + one harvest date, outside the findings ledger; no
 * scorer reads it. Nepal → Australia (the MVP corridor). Re-harvestable via
 * scripts/harvest-dha-evidentiary.mjs.
 *
 * Source: DHA Document Checklist Tool — Commonwealth of Australia (Department of
 * Home Affairs), licensed CC BY 3.0 AU.
 */
export type NepalEvidenceLevel = "Regular" | "Streamlined" | "Undetermined";

export const AU_NEPAL_EVIDENCE_SOURCE =
  ${tsString(TOOL)};
export const AU_NEPAL_EVIDENCE_VERIFIED = ${tsString(date)};
/** DHA study-type code harvested: "01" = "all other students" (mainstream degree-seekers). */
export const AU_NEPAL_EVIDENCE_STUDY_TYPE = "01";

export const AU_NEPAL_EVIDENCE_LEVELS: Record<string, NepalEvidenceLevel> = {
${rows}
};
`;
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const PROV = join(CACHE, "providers.json");
  const EVID = join(CACHE, "evidence.json");
  const date = new Date().toISOString().slice(0, 10);

  // 1) Provider directory (one call, cached).
  let providers;
  if (existsSync(PROV)) {
    providers = JSON.parse(readFileSync(PROV, "utf8"));
  } else {
    const r = await post("/_layouts/15/api/Termstore.aspx/GetTermsByProperty", {
      groupName: "IMMI",
      termSetName: "CRICOS",
      propertyName: "Code",
    });
    providers = (await r.json()).d.data.map((x) => ({ name: x.Key, code: x.Value }));
    writeFileSync(PROV, JSON.stringify(providers));
  }
  console.log(`providers: ${providers.length}`);

  // 2) Per-code Nepal evidence level — gentle + resumable.
  const uniqueCodes = [...new Set(providers.map((p) => normalize(p.code)))];
  const evidence = existsSync(EVID) ? JSON.parse(readFileSync(EVID, "utf8")) : {};
  const todo = uniqueCodes.filter((c) => !(c in evidence) || evidence[c] == null);
  console.log(`evidence: ${uniqueCodes.length - todo.length}/${uniqueCodes.length} cached, harvesting ${todo.length}`);

  const CONC = 2;
  let done = 0;
  const worker = async (slice) => {
    for (const code of slice) {
      const raw = code === "03522E" ? "3522E" : code; // call DHA with the source code
      evidence[code] = await evidenceCall(raw);
      if (++done % 100 === 0) {
        writeFileSync(EVID, JSON.stringify(evidence));
        console.log(`  ...${done}/${todo.length}`);
      }
      await sleep(250 + Math.floor(Math.random() * 150));
    }
  };
  const slices = Array.from({ length: CONC }, () => []);
  todo.forEach((c, i) => slices[i % CONC].push(c));
  await Promise.all(slices.map(worker));
  writeFileSync(EVID, JSON.stringify(evidence));

  const harvested = uniqueCodes.filter((c) => evidence[c] != null);
  const missing = uniqueCodes.length - harvested.length;
  if (missing > 0) {
    console.warn(`WARNING: ${missing} codes still un-harvested (rate-limited). Re-run to resume before regenerating.`);
    process.exit(1);
  }

  // 3) Regenerate both datasets.
  writeFileSync(join(REPO, "lib/data/source/au-cricos-directory.ts"), directoryFile(providers, date));
  writeFileSync(join(REPO, "lib/data/source/au-nepal-evidence-levels.ts"), evidenceFile(harvested.sort(), evidence, date));
  console.log(`wrote au-cricos-directory.ts (${providers.length}) + au-nepal-evidence-levels.ts (${harvested.length})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
