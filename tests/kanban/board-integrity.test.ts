import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateBoard } from "../../docs/kanban/validate.mjs";

/**
 * MV-123. The kanban board is the durable memory that survives a compaction, so a
 * board that quietly lies is worse than one that is merely incomplete. Two lies have
 * already cost real work:
 *
 *  - Duplicate ids: the 2026-07-07 batch flip stamped merge badges onto the wrong
 *    card sharing an id, stranding MV-99 and MV-101 in In Review for ten days, and a
 *    dedup-union of board.json silently DROPPED cards.
 *  - Dead `file:` pointers: 16 dossiers were unreachable from the board because the
 *    pointer omitted the `cards/` prefix.
 *
 * These tests pin the guard that makes `npm run board` refuse to generate either.
 */

const KANBAN = join(process.cwd(), "docs", "kanban");

const COLUMNS = [
  { key: "backlog", name: "Backlog", wip: null, active: false },
  { key: "done", name: "Done", wip: null, active: false },
];
const card = (over: Record<string, unknown> = {}) => ({
  id: "MV-1",
  col: "backlog",
  title: "A card",
  ...over,
});
// Unit cases assert the RULES, so they resolve every pointer unless the case is about pointers.
const allExist = { exists: () => true };

describe("validateBoard", () => {
  it("passes a clean board", () => {
    const board = { columns: COLUMNS, cards: [card(), card({ id: "MV-2" })] };
    expect(validateBoard(board, allExist)).toEqual([]);
  });

  it("rejects duplicate ids, naming both colliding cards", () => {
    // The exact shape of the real bug: two DIFFERENT cards under one id. Any lookup
    // by id (badge stamping, the board.html copy button) silently takes the first.
    const board = {
      columns: COLUMNS,
      cards: [card({ id: "MV-99", title: "step4 multi-subject" }), card({ id: "MV-99", title: "profile restyle" })],
    };
    const errors = validateBoard(board, allExist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MV-99/);
    // Both titles must appear or the human cannot tell which card to renumber.
    expect(errors[0]).toMatch(/step4 multi-subject/);
    expect(errors[0]).toMatch(/profile restyle/);
  });

  it("rejects a file pointer that does not resolve on disk", () => {
    const board = { columns: COLUMNS, cards: [card({ file: "MV-1-ghost.md" })] };
    const errors = validateBoard(board, { exists: () => false });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MV-1-ghost\.md/);
  });

  it("accepts a pointer outside cards/ as long as it resolves", () => {
    // MV-D0 and MV-57 legitimately point at ../audits/ and ../superpowers/specs/.
    // The rule is existence, never a `cards/` prefix.
    const board = { columns: COLUMNS, cards: [card({ file: "../audits/some-audit.md" })] };
    expect(validateBoard(board, allExist)).toEqual([]);
  });

  it("rejects a card whose column key does not exist", () => {
    // build.mjs renders by filtering cards per column key, so a typo'd col makes the
    // card vanish from every column: a silent drop with no error anywhere.
    const board = { columns: COLUMNS, cards: [card({ id: "MV-7", col: "inprogres" })] };
    const errors = validateBoard(board, allExist);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MV-7/);
    expect(errors[0]).toMatch(/inprogres/);
  });

  it("rejects an orphan dossier that no card points at", () => {
    // The costliest lie of all: MV-100 (matches progressive disclosure) shipped and
    // merged as PR #55, then lost its board row in a board.json union. The dossier
    // survived on disk; the board simply forgot the card existed.
    const board = { columns: COLUMNS, cards: [card({ file: "cards/MV-1-kept.md" })] };
    const errors = validateBoard(board, {
      ...allExist,
      dossiers: ["cards/MV-1-kept.md", "cards/MV-100-matches-progressive-disclosure.md"],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MV-100-matches-progressive-disclosure/);
  });

  it("skips the orphan rule when no dossier list is supplied", () => {
    const board = { columns: COLUMNS, cards: [card()] };
    expect(validateBoard(board, allExist)).toEqual([]);
  });

  it("reports every problem at once, not just the first", () => {
    const board = {
      columns: COLUMNS,
      cards: [card({ id: "MV-9" }), card({ id: "MV-9" }), card({ id: "MV-8", col: "nope" })],
    };
    expect(validateBoard(board, allExist).length).toBe(2);
  });
});

describe("the real board.json", () => {
  it("has no duplicate ids, no dead dossier pointers, no unknown columns, and no orphan dossiers", () => {
    // The regression guard. Red on the board as it stood (MV-99 + MV-101 collided,
    // 16 pointers were dead, 2 dossiers were orphaned) and the reason this slice exists.
    const board = JSON.parse(readFileSync(join(KANBAN, "board.json"), "utf8"));
    const errors = validateBoard(board, {
      exists: (f: string) => existsSync(join(KANBAN, f)),
      dossiers: readdirSync(join(KANBAN, "cards"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `cards/${f}`),
    });
    expect(errors).toEqual([]);
  });

  it("still renders every card: each card sits in a real column", () => {
    // Pins the acceptance criterion "card count before == card count after".
    const board = JSON.parse(readFileSync(join(KANBAN, "board.json"), "utf8"));
    const keys = new Set(board.columns.map((c: { key: string }) => c.key));
    const rendered = board.cards.filter((c: { col: string }) => keys.has(c.col));
    expect(rendered).toHaveLength(board.cards.length);
  });
});
