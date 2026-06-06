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

  if (f.value_status === "structured") {
    if (f.value === null || f.value === undefined) {
      errors.push(`structured finding ${f.id} has no value`);
    }
    if (!VALUE_TYPE.has(f.value_type)) {
      errors.push(`structured finding ${f.id} has bad value_type: ${JSON.stringify(f.value_type)}`);
    }
  }

  return errors;
}

module.exports = { FINDING_FIELDS, VALUE_TYPE, VALUE_STATUS, validateFinding };
