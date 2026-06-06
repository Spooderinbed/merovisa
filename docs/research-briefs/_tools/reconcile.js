/**
 * Reconciliation harness — enforces the four foolproofness invariants that
 * link findings/*.jsonl to the data modules consuming them:
 *
 *   (a) Coverage     — every `used` finding is referenced by >=1 code record.
 *   (b) Validity     — every code findingRef exists and is `used`.
 *   (c) Value fidelity — a structured finding's value is actually in the code.
 *   (d) Conflict gate — (wired in Phase 2) no `used` finding in an open conflict.
 *
 * Pure core (reconcileCore) + a CLI runner (added with the registry). No deps.
 */

function norm(s) {
  return String(s).normalize("NFC").replace(/\s+/g, " ").trim();
}

function numericMember(values, n) {
  return values.some((v) => typeof v === "number" && v === n);
}

/** Does the record's set of scalar values contain the finding's structured value? */
function recordContainsValue(values, value, valueType) {
  if (value && typeof value === "object" && "min" in value && "max" in value) {
    return numericMember(values, value.min) && numericMember(values, value.max);
  }
  switch (valueType) {
    case "number":
    case "money":
    case "percent":
    case "duration":
      return numericMember(values, value);
    case "boolean":
      return values.some((v) => v === value);
    case "enum":
      // exact, case-sensitive (e.g. NRB class "A")
      return values.some((v) => String(v).trim() === String(value).trim());
    case "string":
      // tolerant of whitespace + case (addresses, names)
      return values.some((v) => norm(v).toLowerCase() === norm(value).toLowerCase());
    default:
      return false;
  }
}

/** All primitive leaf values of an object, skipping `provenance` and `skipKeys` subtrees. */
function scalarLeaves(obj, skipKeys) {
  const skip = new Set([...(skipKeys || []), "provenance"]);
  const out = [];
  const walk = (o) => {
    if (o === null || o === undefined) return;
    if (Array.isArray(o)) {
      o.forEach(walk);
      return;
    }
    if (typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (skip.has(k)) continue;
        walk(v);
      }
      return;
    }
    out.push(o);
  };
  walk(obj);
  return out;
}

/**
 * Walk a data module into the codeRefs reconcileCore expects. Each top-level
 * record (and each present sub-record key) becomes one codeRef carrying its
 * declared findingRefs and its own scalar values (sub-records excluded from
 * the parent's values so value-matching stays precise to provenance grain).
 *
 * @param data  the exported array (or single object)
 * @param opts  { recordLabel, subRecordKeys[], interface?, subInterface? }
 */
function collectFindingRefs(data, opts = {}) {
  const recordLabel = opts.recordLabel || "record";
  const subRecordKeys = opts.subRecordKeys || [];
  const records = Array.isArray(data) ? data : [data];
  const out = [];
  records.forEach((el, i) => {
    const key = el && el.id != null ? el.id : i;
    const recordPath = `${recordLabel}[${key}]`;
    out.push({
      recordPath,
      interface: opts.interface,
      findingRefs: (el && el.provenance && el.provenance.findingRefs) || [],
      values: scalarLeaves(el, subRecordKeys),
    });
    for (const sk of subRecordKeys) {
      if (el && el[sk] != null && typeof el[sk] === "object") {
        out.push({
          recordPath: `${recordPath}.${sk}`,
          interface: opts.subInterface,
          findingRefs: (el[sk].provenance && el[sk].provenance.findingRefs) || [],
          values: scalarLeaves(el[sk], []),
        });
      }
    }
  });
  return out;
}

/**
 * @param findings  array of finding objects (from findings/*.jsonl)
 * @param codeRefs  array of { recordPath, interface?, findingRefs[], values[] }
 * @param exempt    { provenanceExemptInterfaces?[], findingExemptIds?[] }
 * @returns { errors: string[], report }
 */
function reconcileCore({ findings, codeRefs, exempt = {} }) {
  const exemptInterfaces = new Set(exempt.provenanceExemptInterfaces || []);
  const exemptIds = new Set(exempt.findingExemptIds || []);
  const byId = new Map(findings.map((f) => [f.id, f]));
  const errors = [];
  const referenced = new Set();

  // pass 1 — every code ref resolves to a `used` finding whose value matches
  for (const rec of codeRefs) {
    const refs = rec.findingRefs || [];
    if (refs.length === 0) {
      if (!exemptInterfaces.has(rec.interface)) {
        errors.push(`MISSING_PROVENANCE ${rec.recordPath}`);
      }
      continue;
    }
    for (const fid of refs) {
      referenced.add(fid);
      const f = byId.get(fid);
      if (!f) {
        errors.push(`DANGLING_REF ${rec.recordPath} -> ${fid}`);
        continue;
      }
      if (f.status !== "used") {
        errors.push(`REF_NOT_USED ${rec.recordPath} -> ${fid} (status=${f.status})`);
        continue;
      }
      if (f.value_status === "structured" && !recordContainsValue(rec.values || [], f.value, f.value_type)) {
        errors.push(
          `VALUE_DRIFT ${rec.recordPath} -> ${fid} expected ${JSON.stringify(f.value)} not in ${JSON.stringify(rec.values)}`,
        );
      }
    }
  }

  // pass 2 — every used finding is referenced and declares its value
  for (const f of findings) {
    if (f.status !== "used") continue;
    if (!referenced.has(f.id) && !exemptIds.has(f.id)) errors.push(`ORPHAN_USED ${f.id}`);
    if (f.value_status === "unset") errors.push(`USED_UNSET ${f.id}`);
  }

  const usedCount = findings.filter((f) => f.status === "used").length;
  return { errors, report: { total: findings.length, used: usedCount, referenced: referenced.size } };
}

module.exports = { reconcileCore, recordContainsValue, collectFindingRefs, scalarLeaves };
