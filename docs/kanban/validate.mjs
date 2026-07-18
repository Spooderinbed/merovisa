// Integrity checks for board.json, run by build.mjs before it generates anything.
// The board is the durable memory that survives a compaction, so a board that lies
// is worse than one that is merely incomplete. Each rule below exists because the
// lie it catches has already cost real work (see cards/MV-123-*.md).
//
// Pure: every filesystem fact is injected, so the rules can be tested directly.

const ACTIVE_COLUMNS = ["ready", "inprogress", "inreview"];

/**
 * @param {{columns: {key: string}[], cards: {id: string, col: string, title?: string, file?: string|null}[]}} board
 * @param {{
 *   exists?: (file: string) => boolean,
 *   dossiers?: string[],
 *   readHeading?: (file: string) => string | null,
 *   hasColumnField?: (file: string) => boolean,
 * }} [opts]
 *   `exists` resolves a card's `file:` pointer relative to docs/kanban/; defaults to
 *   accepting every pointer. `dossiers` is every dossier path on disk (relative to
 *   docs/kanban/); when given, any dossier no card points at is reported. `readHeading`
 *   returns a dossier's first markdown heading; when given, its id must match the card.
 *   `hasColumnField` is true when a dossier carries a `**Column:**` line; when given,
 *   any dossier under cards/ that has one is reported (board state lives only in
 *   board.json). Omit any of these to skip that rule.
 * @returns {string[]} human-readable problems; empty means the board is trustworthy.
 */
export function validateBoard(board, opts = {}) {
  const exists = opts.exists ?? (() => true);
  const errors = [];

  // 1. Unique ids. Two cards under one id means every lookup-by-id silently takes
  //    whichever comes first: this is what stamped merge badges onto the wrong card
  //    and what let a dedup-union of board.json drop cards outright.
  const seen = new Map();
  for (const c of board.cards) {
    const first = seen.get(c.id);
    if (first !== undefined) {
      errors.push(
        `duplicate id ${c.id}: "${first}" and "${c.title}" are two different cards sharing one id. ` +
          `Renumber the later one (ids are a namespace, not a label).`,
      );
    } else {
      seen.set(c.id, c.title);
    }
  }

  // 2. Every card sits in a real column. build.mjs renders by filtering cards per
  //    column key, so a typo'd col drops the card from every column with no error.
  const columnKeys = new Set(board.columns.map((c) => c.key));
  for (const c of board.cards) {
    if (!columnKeys.has(c.col)) {
      errors.push(
        `${c.id} has column "${c.col}", which is not a column on this board ` +
          `(${[...columnKeys].join(", ")}). It would render nowhere.`,
      );
    }
  }

  // 3. A card in an active column must HAVE a dossier. The manual's Definition of
  //    Ready already requires one: a cold agent must be able to act from the card
  //    alone. Done and Backlog cards may legitimately have none, so this is
  //    state-aware rather than blanket. MV-69 sat on `file: null` with its dossier
  //    sitting on disk unreferenced.
  for (const c of board.cards) {
    if (ACTIVE_COLUMNS.includes(c.col) && !c.file) {
      errors.push(`${c.id} is in ${c.col} with no dossier. A card cannot be worked from the board row alone.`);
    }
  }

  // 4. Dossier pointers resolve. The rule is existence, not a `cards/` prefix:
  //    MV-D0 and MV-57 legitimately point outside cards/ at an audit and a spec.
  for (const c of board.cards) {
    if (c.file && !exists(c.file)) {
      errors.push(`${c.id} points at "${c.file}", which does not exist. The dossier link is dead.`);
    }
  }

  // 5. A dossier belongs to exactly one card. Existence alone would happily pass a
  //    board where two cards point at each other's dossiers.
  const claimedBy = new Map();
  for (const c of board.cards) {
    if (!c.file) continue;
    const key = normalize(c.file);
    const owner = claimedBy.get(key);
    if (owner !== undefined) {
      errors.push(`${owner} and ${c.id} both point at "${c.file}". A dossier belongs to exactly one card.`);
    } else {
      claimedBy.set(key, c.id);
    }
  }

  // 6. A card's dossier is named for that card. This is what makes a swapped pair
  //    impossible rather than merely unlikely: existence and orphan checks both pass
  //    a swap, because every file is still referenced. Only pointers under cards/ are
  //    bound this way; explicit evidence links (MV-D0 -> an audit, MV-57 -> a spec)
  //    are exempt by design.
  for (const c of board.cards) {
    if (!c.file || !normalize(c.file).startsWith("cards/")) continue;
    const base = normalize(c.file).slice("cards/".length);
    // `${id}.md` or `${id}-slug.md`: the separator matters, or MV-1 would claim MV-12.
    if (base !== `${c.id}.md` && !base.startsWith(`${c.id}-`)) {
      errors.push(`${c.id} points at "${c.file}", which is named for a different card. Rename the file or fix the id.`);
    }
  }

  // 7. A dossier's own heading agrees with the card. A renamed file whose heading
  //    still claims the old id tells a cold agent the wrong story from the first line.
  if (opts.readHeading) {
    for (const c of board.cards) {
      if (!c.file || !normalize(c.file).startsWith("cards/")) continue;
      const heading = opts.readHeading(c.file);
      const claimed = heading && heading.match(/MV-[A-Za-z0-9]+/);
      if (claimed && claimed[0] !== c.id) {
        errors.push(`${c.id}'s dossier "${c.file}" opens with "${claimed[0]}". The dossier disagrees with the board.`);
      }
    }
  }

  // 8. No orphan dossiers. A dossier no card points at is work the board has
  //    forgotten: MV-100 (matches progressive disclosure) shipped and merged as
  //    PR #55, then lost its board row entirely in a board.json union, leaving the
  //    founder-picked design behind `initialVisible={0}` invisible to every later
  //    agent. This is the rule that catches a dropped card.
  if (opts.dossiers) {
    const pointedAt = new Set(board.cards.filter((c) => c.file).map((c) => normalize(c.file)));
    for (const d of opts.dossiers) {
      if (!pointedAt.has(normalize(d))) {
        errors.push(`"${d}" is a dossier no card points at. Either add its card to the board or delete the file.`);
      }
    }
  }

  // 9. No dossier carries a **Column:** field. board.json is the SOLE source of board
  //    STATE (README anti-drift rule 1: "this is why dossiers have no Column: field").
  //    A Column: line in a dossier is a second copy of `col` that drifts out of sync —
  //    MV-123 nearly "resumed" finished work off two dossiers that still read
  //    "In review" for code merged 2026-07-07, and only a git check settled the truth.
  //    Governs dossiers under cards/ only; evidence pointers (MV-D0 → an audit,
  //    MV-57 → a spec) may legitimately contain the substring and are exempt.
  if (opts.hasColumnField) {
    for (const c of board.cards) {
      if (!c.file || !normalize(c.file).startsWith("cards/")) continue;
      if (opts.hasColumnField(c.file)) {
        errors.push(
          `${c.id}'s dossier "${c.file}" carries a **Column:** field. Board state lives ` +
            `only in board.json — delete the field (README anti-drift rule 1).`,
        );
      }
    }
  }

  return errors;
}

/** Compare whole relative paths, never basenames: ../elsewhere/MV-10.md is not cards/MV-10.md. */
function normalize(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}
