/**
 * Canonical finding schema — the single definition of a findings/*.jsonl row.
 * Imported by extract-findings.js (output shape) and reconcile.js (so the
 * reconciler can trust finding fields). Plain CommonJS, no deps.
 */

// Required fields on every finding (used_by is optional, present only when used).
const FINDING_FIELDS = [
  "id",
  "topic",
  "category",
  "claim",
  "entity",
  "attribute",
  "source",
  "publisher",
  "source_date",
  "confidence",
  "claim_type",
  "caveats",
  "target",
  "conflict_with",
  "dup_group",
  "status",
  "value",
  "value_type",
  "unit",
  "value_status",
];

const CONFIDENCE = new Set(["primary", "practitioner", "anecdotal"]);
const CLAIM_TYPE = new Set(["data", "process", "contact", "red-flag"]);
const VALUE_STATUS = new Set(["unset", "structured", "prose-only"]);
const VALUE_TYPE = new Set(["number", "enum", "string", "boolean", "money", "percent", "duration"]);
// Optional: set on members of an entity+attribute cluster (see build-ledger.js).
// Absent = not in a cluster. "contradiction" members must resolve via the conflict gate.
const CLUSTER_TRIAGE = new Set(["untriaged", "enumeration", "contradiction", "duplicate"]);
// Optional, human-owned (memo: docs/audits/2026-06-10-data-governance-and-triage.md):
// what should happen to a *pending* finding next. status answers "is this wired
// into the product?" (machine-derived by flip-status); triage answers "what should
// humans do with it?". Automation never writes triage; integrating or rejecting a
// finding requires clearing its triage in the same change — validation fails on a
// non-pending triaged finding as the designed reminder. Requires a one-line
// triage_reason. Distinct from cluster_triage, which records a cluster's shape.
const TRIAGE = new Set(["ready", "use-later", "needs-human-call", "stale"]);

function isValidStatus(s) {
  return s === "pending" || s === "used" || (typeof s === "string" && s.startsWith("rejected:"));
}

/**
 * Validate a finding object. Returns an array of error strings (empty = valid).
 * Pure — never throws on a malformed finding.
 */
function validateFinding(f) {
  if (!f || typeof f !== "object") return ["finding is not an object"];
  const errors = [];

  for (const k of FINDING_FIELDS) {
    if (!(k in f)) errors.push(`missing field: ${k}`);
  }

  // Category letter + optional sub-topic digit (J1, J2) + zero-padded number.
  if (typeof f.id !== "string" || !/^[A-J]\d*\.\d{3,}$/.test(f.id)) {
    errors.push(`bad id: ${JSON.stringify(f.id)}`);
  }
  if (!CONFIDENCE.has(f.confidence)) errors.push(`bad confidence: ${JSON.stringify(f.confidence)}`);
  if (!CLAIM_TYPE.has(f.claim_type)) errors.push(`bad claim_type: ${JSON.stringify(f.claim_type)}`);
  if (!isValidStatus(f.status)) errors.push(`bad status: ${JSON.stringify(f.status)}`);
  if (!VALUE_STATUS.has(f.value_status)) errors.push(`bad value_status: ${JSON.stringify(f.value_status)}`);
  if (f.cluster_triage != null && !CLUSTER_TRIAGE.has(f.cluster_triage)) {
    errors.push(`bad cluster_triage: ${JSON.stringify(f.cluster_triage)}`);
  }

  if (f.value_status === "structured") {
    if (f.value === null || f.value === undefined) {
      errors.push(`structured finding ${f.id} has no value`);
    }
    if (!VALUE_TYPE.has(f.value_type)) {
      errors.push(`structured finding ${f.id} has bad value_type: ${JSON.stringify(f.value_type)}`);
    }
  }

  if (f.triage != null || f.triage_reason != null) {
    if (f.triage == null) {
      errors.push(`triage_reason without triage on ${f.id}`);
    } else if (!TRIAGE.has(f.triage)) {
      errors.push(`bad triage: ${JSON.stringify(f.triage)}`);
    }
    if (typeof f.triage_reason !== "string" || !f.triage_reason.trim()) {
      errors.push(`triage on ${f.id} requires a non-empty triage_reason`);
    }
    if (f.triage != null && f.status !== "pending") {
      errors.push(
        `triage on non-pending ${f.id} (status ${JSON.stringify(f.status)}) — clear triage when integrating or rejecting`,
      );
    }
  }

  return errors;
}

module.exports = { FINDING_FIELDS, VALUE_TYPE, VALUE_STATUS, TRIAGE, validateFinding };
