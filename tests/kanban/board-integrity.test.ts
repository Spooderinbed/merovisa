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

  it("rejects two cards that swap each other's dossiers (existence alone passes this)", () => {
    // Codex's counterexample against an existence-only check: both files exist and both
    // are referenced, so the resolve rule AND the orphan rule pass while the board tells
    // the wrong story about both cards. The original bug was an identity bug (a merge
    // badge stamped onto the wrong card), so identity is the rule that matters.
    const board = {
      columns: COLUMNS,
      cards: [
        card({ id: "MV-125", file: "cards/MV-126-guide-restyle.md" }),
        card({ id: "MV-126", file: "cards/MV-125-profile-restyle.md" }),
      ],
    };
    const errors = validateBoard(board, {
      ...allExist,
      dossiers: ["cards/MV-125-profile-restyle.md", "cards/MV-126-guide-restyle.md"],
    });
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => /named for a different card/.test(e))).toBe(true);
  });

  it("rejects two cards pointing at the same dossier", () => {
    const board = {
      columns: COLUMNS,
      cards: [card({ id: "MV-1", file: "cards/MV-1-x.md" }), card({ id: "MV-2", file: "cards/MV-1-x.md" })],
    };
    const errors = validateBoard(board, allExist);
    // The shared pointer, plus MV-2 being named for MV-1.
    expect(errors.some((e) => /both point at/.test(e))).toBe(true);
  });

  it("does not let MV-1 claim MV-12's dossier (the id must end at a separator)", () => {
    const board = { columns: COLUMNS, cards: [card({ id: "MV-1", file: "cards/MV-12-other.md" })] };
    expect(validateBoard(board, allExist)).toHaveLength(1);
  });

  it("accepts both `MV-N.md` and `MV-N-slug.md` naming", () => {
    const board = {
      columns: COLUMNS,
      cards: [card({ id: "MV-111", file: "cards/MV-111.md" }), card({ id: "MV-2", file: "cards/MV-2-slug.md" })],
    };
    expect(validateBoard(board, allExist)).toEqual([]);
  });

  it("exempts explicit evidence pointers outside cards/ from the naming rule", () => {
    // MV-D0 points at an audit and MV-57 at a spec. Those are deliberate links, not dossiers.
    const board = {
      columns: COLUMNS,
      cards: [card({ id: "MV-D0", file: "../audits/2026-06-18-EXECUTION-CHECKPOINT.md" })],
    };
    expect(validateBoard(board, allExist)).toEqual([]);
  });

  it("rejects an active-column card with no dossier, but allows a done one", () => {
    // MV-69 sat on `file: null` while its dossier existed on disk, unreferenced.
    const cols = [...COLUMNS, { key: "inreview", name: "In review", wip: 3, active: true }];
    expect(validateBoard({ columns: cols, cards: [card({ id: "MV-69", col: "inreview", file: null })] }, allExist))
      .toHaveLength(1);
    // Done and Backlog cards legitimately have no dossier: 25 of them do not.
    expect(validateBoard({ columns: cols, cards: [card({ id: "MV-69", col: "done", file: null })] }, allExist))
      .toEqual([]);
  });

  it("rejects a dossier whose own heading claims a different card", () => {
    // Exactly the mistake renaming a file invites: pointer right, first line wrong.
    const board = { columns: COLUMNS, cards: [card({ id: "MV-125", file: "cards/MV-125-profile-restyle.md" })] };
    const errors = validateBoard(board, {
      ...allExist,
      readHeading: () => "# MV-99 — Overhaul Phase 2 / profile shell restyle",
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/opens with "MV-99"/);
  });

  it("compares whole paths, so ../elsewhere/MV-10.md does not satisfy cards/MV-10.md", () => {
    // Basename comparison would call the orphan referenced and miss a forgotten card.
    const board = { columns: COLUMNS, cards: [card({ id: "MV-D0", file: "../audits/MV-10.md" })] };
    const errors = validateBoard(board, { ...allExist, dossiers: ["cards/MV-10.md"] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/no card points at/);
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

  // MV-128. board.json is the SOLE source of board STATE (README anti-drift rule 1:
  // "this is why dossiers have no Column: field"). A `**Column:**` line in a dossier is
  // a second copy of col that drifts — MV-123 nearly "resumed" finished work off two
  // dossiers that still read "In review" for code merged 2026-07-07.
  it("rejects a dossier under cards/ that carries a **Column:** field", () => {
    const board = { columns: COLUMNS, cards: [card({ id: "MV-1", file: "cards/MV-1-x.md" })] };
    const errors = validateBoard(board, { ...allExist, hasColumnField: () => true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MV-1/);
    expect(errors[0]).toMatch(/Column/);
  });

  it("passes a dossier with no Column field", () => {
    const board = { columns: COLUMNS, cards: [card({ id: "MV-1", file: "cards/MV-1-x.md" })] };
    expect(validateBoard(board, { ...allExist, hasColumnField: () => false })).toEqual([]);
  });

  it("skips the Column-field rule when no reader is supplied", () => {
    const board = { columns: COLUMNS, cards: [card({ id: "MV-1", file: "cards/MV-1-x.md" })] };
    expect(validateBoard(board, allExist)).toEqual([]);
  });

  it("governs only dossiers under cards/, exempting evidence pointers", () => {
    // MV-D0 -> an audit, MV-57 -> a spec: not dossiers, and free to contain the substring.
    const board = { columns: COLUMNS, cards: [card({ id: "MV-D0", file: "../audits/x.md" })] };
    expect(validateBoard(board, { ...allExist, hasColumnField: () => true })).toEqual([]);
  });
});

describe("the real board.json", () => {
  it("has no duplicate ids, no dead/orphan dossiers, no unknown columns, and no dossier Column field", () => {
    // The regression guard. Red on the board as it stood (MV-99 + MV-101 collided,
    // 16 pointers were dead, 2 dossiers were orphaned) and the reason this slice exists.
    // MV-128 adds the Column-field check: red again on the 61 dossiers that carried a
    // stale `**Column:**` line duplicating board.json's col.
    const board = JSON.parse(readFileSync(join(KANBAN, "board.json"), "utf8"));
    const errors = validateBoard(board, {
      exists: (f: string) => existsSync(join(KANBAN, f)),
      dossiers: readdirSync(join(KANBAN, "cards"))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `cards/${f}`),
      readHeading: (f: string) => readFileSync(join(KANBAN, f), "utf8").match(/^#\s.*/m)?.[0] ?? null,
      hasColumnField: (f: string) => /^\*\*Column:\*\*/m.test(readFileSync(join(KANBAN, f), "utf8")),
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
