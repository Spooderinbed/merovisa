#!/usr/bin/env node
/**
 * Slice-kit: derive each finding's `status` from what code actually references.
 *
 * The `used` set is not hand-edited — it is a pure function of the code's declared
 * findingRefs. This replaces the old fragile name-regex flip (which misfired) with
 * an exact, self-healing derivation:
 *
 *   - referenced by code        → status:"used", used_by = the referencing recordPaths
 *   - used but no longer in code → demoted back to "pending" (self-healing)
 *   - referenced + in an unresolved contradiction (>1 referenced non-rejected
 *     member in a conflict_with component) → REFUSED, left for human resolution
 *     (matches the conflict gate: a contradiction may ship at most one used member)
 *   - referenced but already rejected → never auto-promoted; reported
 *
 * Pure core (computeFlips) is TDD-tested. The registry bridge + JSONL rewrite live
 * in the write-mode runner tests/data/flip-status.run.test.ts (FLIP_STATUS=1),
 * mirroring the WRITE_GOLDENS pattern so the TS registry stays the single source of
 * truth and no standalone TS runner is needed. No deps.
 */

function isRejected(status) {
  return typeof status === "string" && status.startsWith("rejected:");
}

function sameRefs(a, b) {
  // A non-array used_by (legacy bare string, or missing) is never "same" — it must
  // be rewritten to the code-derived array form.
  if (!Array.isArray(a)) return false;
  const x = a.slice().sort();
  const y = (b || []).slice().sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Conflict-component membership from symmetric `conflict_with` edges. id → Set(componentIds). */
function componentMap(findings) {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  for (const f of findings) {
    if (f.conflict_with == null) continue;
    const partners = Array.isArray(f.conflict_with) ? f.conflict_with : [f.conflict_with];
    for (const p of partners) {
      link(f.id, p);
      link(p, f.id);
    }
  }
  const comp = new Map();
  const seen = new Set();
  for (const f of findings) {
    if (!adj.has(f.id) || seen.has(f.id)) continue;
    const members = new Set([f.id]);
    const queue = [f.id];
    seen.add(f.id);
    while (queue.length) {
      const id = queue.shift();
      for (const nb of adj.get(id) || []) {
        if (!seen.has(nb)) {
          seen.add(nb);
          members.add(nb);
          queue.push(nb);
        }
      }
    }
    for (const id of members) comp.set(id, members);
  }
  return comp;
}

/**
 * Compute the status/used_by changes implied by the code's findingRefs.
 *
 * @param findings  array of finding objects (from findings/*.jsonl)
 * @param usedBy    { [findingId]: recordPath[] } — presence = referenced by code
 * @returns { report, changedById } — changedById maps an id to its new fields
 *          ({status, used_by}); used_by omitted means "remove the field".
 */
function computeFlips({ findings, usedBy }) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const comp = componentMap(findings);
  const isReferenced = (id) => Array.isArray(usedBy[id]) && usedBy[id].length > 0;

  // A contradiction component with >1 referenced, non-rejected member cannot be
  // auto-resolved — refuse every such member rather than ship two conflicting values.
  const refusedSet = new Set();
  const visited = new Set();
  for (const f of findings) {
    const members = comp.get(f.id);
    if (!members) continue;
    const key = [...members].sort().join(",");
    if (visited.has(key)) continue;
    visited.add(key);
    const candidates = [...members].filter(
      (id) => isReferenced(id) && byId.get(id) && !isRejected(byId.get(id).status),
    );
    if (candidates.length > 1) candidates.forEach((id) => refusedSet.add(id));
  }

  const report = { promoted: [], demoted: [], refused: [], refToRejected: [], rewired: [] };
  const changedById = {};

  for (const f of findings) {
    const referenced = isReferenced(f.id);
    const refs = referenced ? usedBy[f.id].slice().sort() : null;

    if (referenced && isRejected(f.status)) {
      report.refToRejected.push(f.id);
      continue;
    }
    if (refusedSet.has(f.id)) {
      report.refused.push(f.id);
      continue;
    }

    if (referenced) {
      if (f.status !== "used") {
        report.promoted.push(f.id);
        changedById[f.id] = { status: "used", used_by: refs };
      } else if (!sameRefs(f.used_by, refs)) {
        report.rewired.push(f.id);
        changedById[f.id] = { status: "used", used_by: refs };
      }
    } else if (f.status === "used") {
      report.demoted.push(f.id);
      changedById[f.id] = { status: "pending" }; // used_by omitted → removed
    }
  }

  return { report, changedById };
}

module.exports = { computeFlips, componentMap, isRejected, sameRefs };
