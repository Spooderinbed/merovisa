import { describe, it, expect } from "vitest";
import { idDelta as idDeltaImpl } from "../../docs/research-briefs/_tools/check-id-immutability.js";

type Delta = { missing: string[]; added: string[] };
const idDelta = idDeltaImpl as unknown as (committed: string[], current: string[]) => Delta;

describe("idDelta (a committed finding id may never disappear or be renumbered)", () => {
  it("reports nothing when ids are unchanged", () => {
    expect(idDelta(["B.001", "B.002"], ["B.001", "B.002"]).missing).toEqual([]);
  });

  it("flags a committed id that disappeared from the current set", () => {
    expect(idDelta(["B.001", "B.002"], ["B.001"]).missing).toEqual(["B.002"]);
  });

  it("treats a renumber as a disappearance of the old id (and an addition of the new)", () => {
    const d = idDelta(["B.002"], ["B.151"]);
    expect(d.missing).toEqual(["B.002"]);
    expect(d.added).toEqual(["B.151"]);
  });

  it("allows pure additions (new findings)", () => {
    expect(idDelta(["B.001"], ["B.001", "B.002"]).missing).toEqual([]);
  });

  it("is order-insensitive", () => {
    expect(idDelta(["B.002", "B.001"], ["B.001", "B.002"]).missing).toEqual([]);
  });
});
