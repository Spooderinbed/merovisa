// Integrity checks for board.json, run by build.mjs before it generates anything.
// The board is the durable memory that survives a compaction, so a board that lies
// is worse than one that is merely incomplete. Each rule below exists because the
// lie it catches has already cost real work (see cards/MV-123-*.md).
//
// Pure and fs-free: `exists` is injected so the rules can be tested directly.

/**
 * @param {{columns: {key: string}[], cards: {id: string, col: string, title?: string, file?: string}[]}} board
 * @param {{exists?: (file: string) => boolean, dossiers?: string[]}} [opts]
 *   `exists` resolves a card's `file:` pointer relative to docs/kanban/. Defaults to
 *   accepting every pointer. `dossiers` is every dossier path on disk; when given,
 *   any dossier no card points at is reported. Omit to skip that rule.
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

  // 3. Dossier pointers resolve. The rule is existence, not a `cards/` prefix:
  //    MV-D0 and MV-57 legitimately point outside cards/ at an audit and a spec.
  for (const c of board.cards) {
    if (c.file && !exists(c.file)) {
      errors.push(`${c.id} points at "${c.file}", which does not exist. The dossier link is dead.`);
    }
  }

  // 4. No orphan dossiers. A dossier no card points at is work the board has
  //    forgotten: MV-100 (matches progressive disclosure) shipped and merged as
  //    PR #55, then lost its board row entirely in a board.json union, leaving the
  //    founder-picked design behind `initialVisible={0}` invisible to every later
  //    agent. This is the rule that catches a dropped card.
  if (opts.dossiers) {
    const pointedAt = new Set(board.cards.filter((c) => c.file).map((c) => basename(c.file)));
    for (const d of opts.dossiers) {
      if (!pointedAt.has(basename(d))) {
        errors.push(`"${d}" is a dossier no card points at. Either add its card to the board or delete the file.`);
      }
    }
  }

  return errors;
}

/** Last path segment, for either separator. Kept local so this file stays fs-free. */
function basename(p) {
  return p.split(/[\\/]/).pop();
}
