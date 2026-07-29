import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The generated board is the durable memory a cold agent reads after a compaction, so
 * a field it renders as the literal string "undefined" is worse than one it omits —
 * it reads as corruption and tells the reader nothing about the card.
 *
 * build.mjs looked priorities up in a hand-enumerated map (`{P1, P2, P3}`), so every
 * card outside that list rendered `· undefined ·`. Six cards were affected, and NOT
 * only P0 (MV-27 is P4) — which is why the fix is a fallback to the card's own value
 * rather than another hand-maintained entry.
 */

const KANBAN = join(process.cwd(), "docs", "kanban");

type Card = { id: string; pri?: string };
const board = JSON.parse(readFileSync(join(KANBAN, "board.json"), "utf8")) as { cards: Card[] };
const md = readFileSync(join(KANBAN, "board.md"), "utf8");

/** Card id → everything the row renders after "- **MV-NN** · ". */
const renderedRows = new Map<string, string>();
for (const line of md.split("\n")) {
  const m = line.match(/^- \*\*(MV-[A-Za-z0-9]+)\*\* · (.*)$/);
  if (m) renderedRows.set(m[1]!, m[2]!);
}

describe("board.md priority rendering", () => {
  it("finds the generated rows at all, so the assertions below are not vacuous", () => {
    expect(renderedRows.size).toBeGreaterThan(100);
  });

  it("never renders a priority as the literal string undefined", () => {
    const broken = [...renderedRows].filter(([, rest]) => rest.startsWith("undefined")).map(([id]) => id);
    expect(broken).toEqual([]);
  });

  it("renders each card's own priority label, whatever priority it uses", () => {
    // Deliberately not a whitelist of P1-P3: the bug WAS the whitelist. Any priority
    // a human puts in board.json must survive the round trip to the rendered board.
    // Rows absent from board.md are skipped — staleness is the ritual's job, not this
    // test's, and coupling here would fail every PR that adds a card.
    const mismatched = board.cards
      .filter((c) => c.pri && renderedRows.has(c.id))
      .filter((c) => !renderedRows.get(c.id)!.startsWith(`${c.pri} · `))
      .map((c) => `${c.id} (pri ${c.pri}) rendered: ${renderedRows.get(c.id)!.slice(0, 30)}`);
    expect(mismatched).toEqual([]);
  });
});
