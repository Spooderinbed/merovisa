// MV-148: joins live GitHub PR data onto board cards for build.mjs.
//
// Everything here is DERIVED AND EPHEMERAL — the same class of field as ageDays.
// Nothing in this file is ever written back to board.json: the board's state model
// stays exactly what a human hand-edits, and a GitHub outage can only cost the chips,
// never the board (README anti-drift rule 1).
//
// Pure: the `gh` call itself lives in build.mjs, so every rule below is testable by
// handing it plain objects.

/** Card ids as they appear in branch names and PR titles: mv-148-slug, "MV-148 — …". */
const ID_IN_TEXT = /MV-([A-Za-z0-9]+)/gi;

/**
 * Parse `gh pr list --json …` stdout.
 *
 * A malformed body is reported as an error rather than an empty list: a truncated or
 * error-prefixed stdout must never render as "this repo has no PRs", which looks
 * identical to a genuinely quiet board.
 *
 * @param {string} raw
 * @returns {{prs: any[], error: string|null}}
 */
export function parsePrList(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return { prs: [], error: "gh output could not be parsed as JSON" };
  }
  if (!Array.isArray(data)) {
    return { prs: [], error: "gh output could not be parsed as a PR list (expected a JSON array)" };
  }
  return { prs: data, error: null };
}

/**
 * Join PRs onto cards by the MV-id carried in the head branch name, falling back to
 * the PR title. Branch wins outright when it names a card: a title that merely
 * *mentions* another id ("MV-148 supersedes MV-130") must not staple this PR onto a
 * parallel session's row.
 *
 * @param {{id: string, formerId?: string}[]} cards
 * @param {any[]} prs raw rows from `gh pr list --json`
 * @returns {Map<string, ReturnType<typeof normalizePr>[]>} card id → its PRs, open first then newest
 */
export function matchPrsToCards(cards, prs) {
  // Renumbered cards keep a formerId because branches, commits and PRs permanently
  // use the old id (README: MV-125 records formerId MV-99).
  const cardByKey = new Map();
  for (const c of cards) {
    cardByKey.set(String(c.id).toUpperCase(), c.id);
    if (c.formerId) cardByKey.set(String(c.formerId).toUpperCase(), c.id);
  }

  const byCard = new Map();
  for (const raw of Array.isArray(prs) ? prs : []) {
    const fromBranch = cardIdsIn(raw?.headRefName);
    const keys = fromBranch.length ? fromBranch : cardIdsIn(raw?.title);
    const targets = new Set();
    for (const k of keys) {
      const id = cardByKey.get(k);
      if (id) targets.add(id);
    }
    if (!targets.size) continue;
    const pr = normalizePr(raw);
    for (const id of targets) {
      if (!byCard.has(id)) byCard.set(id, []);
      byCard.get(id).push(pr);
    }
  }
  for (const list of byCard.values()) list.sort(openThenNewest);
  return byCard;
}

/**
 * Roll a PR's statusCheckRollup into one word plus its counts. A failure outranks a
 * still-running check: waiting on a run that cannot go green is not "pending", and
 * the founder needs to see red now.
 *
 * @param {any[]|undefined|null} checks
 * @returns {{state: "passing"|"failing"|"pending"|"none", passed: number, failed: number, pending: number, total: number}}
 */
export function ciState(checks) {
  const list = Array.isArray(checks) ? checks : [];
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const c of list) {
    const b = bucket(c);
    if (b === "pass") passed += 1;
    else if (b === "fail") failed += 1;
    else pending += 1;
  }
  const state = failed ? "failing" : pending ? "pending" : passed ? "passing" : "none";
  return { state, passed, failed, pending, total: list.length };
}

/**
 * Roll a PR's files up to top-level directories, busiest first — "what part of the
 * codebase does this touch" at a glance, without listing 33 paths.
 *
 * @param {{path?: string}[]|undefined|null} files
 * @returns {{dir: string, files: number}[]}
 */
export function summarizeAreas(files) {
  const counts = new Map();
  for (const f of Array.isArray(files) ? files : []) {
    const path = String(f?.path ?? "").replace(/\\/g, "/");
    if (!path) continue;
    const slash = path.indexOf("/");
    const dir = slash > 0 ? path.slice(0, slash) : "(root)";
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([dir, n]) => ({ dir, files: n }));
}

/**
 * Cross-check board state against the repo. These are WARNINGS, never refusals:
 * validate.mjs's exit-1 semantics stay reserved for real state corruption, and PR
 * data is ephemeral — a GitHub hiccup must not be able to block `npm run board`.
 *
 * One warning per card. A merged PR on a card in In Review satisfies both rules, and
 * reporting it twice trains the reader to skim past warnings.
 *
 * @param {{id: string, col: string}[]} cards
 * @param {Map<string, any[]>} byCard
 * @returns {string[]}
 */
export function reconcile(cards, byCard) {
  const warnings = [];
  for (const c of cards) {
    const prs = byCard.get(c.id) ?? [];
    const merged = prs.filter((p) => p.state === "merged");
    if (merged.length && c.col !== "done") {
      const list = merged.map((p) => `#${p.number}`).join(", ");
      warnings.push(`${c.id} is in "${c.col}" but its PR ${list} is already merged — the board is behind the repo.`);
      continue;
    }
    if (c.col === "inreview" && !prs.some((p) => p.state === "open")) {
      warnings.push(`${c.id} is in In Review with no open PR — it is waiting at a gate with nothing to gate.`);
    }
  }
  return warnings;
}

/** Every MV-id in a string, upper-cased. Greedy on the id body, so MV-1 never claims MV-12. */
function cardIdsIn(text) {
  if (!text) return [];
  const out = [];
  for (const m of String(text).matchAll(ID_IN_TEXT)) out.push(`MV-${m[1].toUpperCase()}`);
  return out;
}

/** gh omits fields it cannot resolve, so every read here is defensive. */
function normalizePr(p) {
  const files = Array.isArray(p?.files) ? p.files : [];
  return {
    number: p?.number ?? null,
    url: p?.url ?? null,
    title: p?.title ?? "",
    branch: p?.headRefName ?? "",
    draft: p?.isDraft === true,
    state: String(p?.state ?? "OPEN").toLowerCase(),
    // gh returns "" when no review has happened; that is "not reviewed", not a decision.
    review: p?.reviewDecision ? String(p.reviewDecision).toLowerCase() : null,
    ci: ciState(p?.statusCheckRollup),
    additions: p?.additions ?? 0,
    deletions: p?.deletions ?? 0,
    changedFiles: files.length,
    areas: summarizeAreas(files),
  };
}

function openThenNewest(a, b) {
  const rank = (p) => (p.state === "open" ? 0 : 1);
  return rank(a) - rank(b) || (b.number ?? 0) - (a.number ?? 0);
}

const PASSING_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);

function bucket(check) {
  if (check?.__typename === "StatusContext") {
    const s = String(check.state ?? "").toUpperCase();
    if (s === "SUCCESS") return "pass";
    if (s === "FAILURE" || s === "ERROR") return "fail";
    return "pending";
  }
  // CheckRun, and anything else gh hands us carrying a status/conclusion pair.
  if (String(check?.status ?? "").toUpperCase() !== "COMPLETED") return "pending";
  return PASSING_CONCLUSIONS.has(String(check?.conclusion ?? "").toUpperCase()) ? "pass" : "fail";
}
