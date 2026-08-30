import { describe, it, expect, vi } from "vitest";

// The read model is `server-only` (judgement must never reach client JS).
// This is the established repo idiom for testing such a module.
vi.mock("server-only", () => ({}));

import {
  BLOCKER_RANK_ORDER,
  deriveSubmittability,
  preferredShortlistTier,
  type SubmittabilityInputs,
} from "@/lib/judgement/submittability";
import { generateChecklist } from "@/lib/checklist/generator";
import { completion, computeReadiness } from "@/lib/checklist/readiness";
import { FUNDING_SOURCES } from "@/lib/scoring/types";
import type { DocumentKind } from "@/lib/documents/types";
import type { Program } from "@/lib/programs/types";

/**
 * MV-199 criteria 2–3 — the case-scoped submittability read.
 *
 * The measurement (`./submittability-read-measurement.test.ts`) established that the
 * denominator AND the rollup already exist, and that the gap is REACH: nothing outside
 * the student's checklist view can ask "is this case submittable". So this module
 * **lifts** `computeReadiness` rather than reimplementing it, and adds the two things
 * the checklist has never had — a case-scoped entry point, and a ranked single blocker.
 */

const masters: Program = {
  id: "p-masters",
  universityId: "u1",
  name: "Master of IT",
  level: "masters",
  field: "computer-science",
  tuitionMin: 40000,
  tuitionMax: 45000,
  tuitionCurrency: "AUD",
  minGrade: 65,
  minEnglish: 6.5,
  minEnglishBand: 6,
  intakes: ["feb"],
  source: "https://example.edu/it",
  lastVerified: "2026-01-01",
  dataQuality: "primary",
  notes: null,
};

const secondMasters: Program = { ...masters, id: "p-masters-2", name: "Master of Data Science" };
const bachelors: Program = { ...masters, id: "p-bachelors", name: "Bachelor of IT", level: "bachelors" };

describe("MV-199 — which program the read is stated for", () => {
  it("prefers APPLIED over shortlisted — an application is a commitment a save is not", () => {
    const tier = preferredShortlistTier([
      { programId: "a", status: "shortlisted" },
      { programId: "b", status: "applied" },
      { programId: "c", status: "shortlisted" },
    ]);
    expect(tier).toEqual(["b"]);
  });

  it("falls back to the whole shortlist when nothing has been applied to", () => {
    const tier = preferredShortlistTier([
      { programId: "c", status: "shortlisted" },
      { programId: "a", status: "shortlisted" },
    ]);
    // Sorted, so the same case resolves to the same program on every render.
    expect(tier).toEqual(["a", "c"]);
  });

  it("never selects a withdrawn program, even when it is the only one", () => {
    expect(preferredShortlistTier([{ programId: "a", status: "withdrawn" }])).toEqual([]);
  });
});

describe("MV-199 — when the read cannot be stated", () => {
  const inputs = {
    sections: {},
    uploadedKinds: new Set<never>(),
    obtainedKinds: new Set<never>(),
    planStates: {},
  };

  it("no candidate program: the required set depends on the program, so there is no answer", () => {
    expect(deriveSubmittability({ ...inputs, programs: [] })).toEqual({ state: "no-program" });
  });

  it("candidates that need DIFFERENT evidence: it says so rather than picking one", () => {
    // A bachelors program requires +2 and SLC/SEE; a masters requires transcripts. The
    // answer would be a different answer depending on which one was picked, so picking
    // silently would be a guess wearing a rollup's clothes.
    const read = deriveSubmittability({ ...inputs, programs: [bachelors, masters] });
    expect(read).toEqual({ state: "programs-differ", programCount: 2 });
  });

  it("candidates that need the SAME evidence: one answer, naming the program it is stated for", () => {
    const read = deriveSubmittability({ ...inputs, programs: [secondMasters, masters] });
    if (read.state !== "read") throw new Error(`expected a read, got ${read.state}`);
    // Named, and deterministic: the lowest program id, so provenance on the rows is
    // attributable to one catalogue entry rather than to an arbitrary member of a set.
    expect(read.program).toEqual({ id: "p-masters", name: "Master of IT" });
    expect(read.alsoCovers).toBe(1);
  });
});

/** The read for one masters case, or a thrown error naming the state that came back. */
function readOf(over: Partial<SubmittabilityInputs> = {}) {
  const read = deriveSubmittability({
    programs: [masters],
    sections: {},
    uploadedKinds: new Set<DocumentKind>(),
    obtainedKinds: new Set<DocumentKind>(),
    planStates: {},
    ...over,
  });
  if (read.state !== "read") throw new Error(`expected a read, got ${read.state}`);
  return read;
}

const keysOf = (rows: readonly { key: string }[]) => rows.map((r) => r.key);

describe("MV-199 — the rollup is lifted, not reimplemented", () => {
  it("the counts ARE computeReadiness's, per stage", () => {
    // The measurement pinned `computeReadiness` as the only rollup in the codebase and
    // this read must not become a second one. Same inputs, same numbers — if this ever
    // diverges, one of the two is lying to a counsellor.
    const planStates = { "doc-preparation": "done" as const, biometrics: "done" as const };
    const uploadedKinds = new Set<DocumentKind>(["passport", "coe"]);
    const items = generateChecklist({ program: masters, sections: {}, uploadedKinds });
    const expected = computeReadiness(items, planStates);
    const read = readOf({ uploadedKinds, planStates });

    expect({ ready: read.apply.ready, total: read.apply.total }).toEqual(expected.now);
    expect({ ready: read.lodge.ready, total: read.lodge.total }).toEqual(expected.afterOffer);
    expect(read.apply.complete).toBe(expected.readyToApplyNow);
  });

  it("every counted row is carried, so a counsellor can see what produced the answer", () => {
    const read = readOf();
    expect(read.apply.rows.length).toBe(read.apply.total);
    expect(read.lodge.rows.length).toBe(read.lodge.total);
  });
});

describe("MV-199 — apply-stage and lodge-stage are stated separately", () => {
  it("both stages carry a denominator, and they are different sets", () => {
    const read = readOf();
    expect(read.apply.total).toBeGreaterThan(0);
    expect(read.lodge.total).toBeGreaterThan(0);
    expect(keysOf(read.apply.rows)).not.toEqual(keysOf(read.lodge.rows));
    expect(keysOf(read.lodge.rows)).toContain("coe");
    expect(keysOf(read.apply.rows)).not.toContain("coe");
  });

  it("a case ready to APPLY is not thereby ready to LODGE", () => {
    // The distinction the measurement said this slice must not blur: `readyToApplyNow`
    // ignores the after-offer set, which is the visa-stage evidence.
    const read = readOf({
      uploadedKinds: new Set<DocumentKind>(["passport", "national-id", "bachelors-transcript", "ielts", "bank-statement"]),
      planStates: { "doc-preparation": "done" },
    });
    expect(read.apply.complete).toBe(true);
    expect(read.lodge.complete).toBe(false);
  });
});

describe("MV-199 — what counts, and what may never count", () => {
  it("a required row that cannot be completed is not in any denominator", () => {
    // Measured in criterion 1: some required rows carry kind:null and status:"info" —
    // a reference note nobody can upload. Counting them would invent work that has no
    // completion signal, and the denominator would never reach its numerator.
    const read = readOf();
    expect(keysOf(read.apply.rows)).not.toContain("fin-nrb-remittance");
    const nursing = deriveSubmittability({
      programs: [{ ...masters, field: "nursing" }],
      sections: {},
      uploadedKinds: new Set<DocumentKind>(),
      obtainedKinds: new Set<DocumentKind>(),
      planStates: {},
    });
    if (nursing.state !== "read") throw new Error("expected a read");
    expect(keysOf(nursing.apply.rows)).not.toContain("ahpra");
  });

  it("recommended rows are not requirements and never count", () => {
    // `plus-two` is recommended for a postgraduate program, required for a bachelors.
    const read = readOf();
    expect(keysOf(read.apply.rows)).not.toContain("plus-two");
    const school = deriveSubmittability({
      programs: [bachelors],
      sections: {},
      uploadedKinds: new Set<DocumentKind>(),
      obtainedKinds: new Set<DocumentKind>(),
      planStates: {},
    });
    if (school.state !== "read") throw new Error("expected a read");
    expect(keysOf(school.apply.rows)).toContain("plus-two");
  });

  it("plan-linked required rows count, and move with the PLAN, not the vault", () => {
    // The second measured constraint: `CHECKLIST_PLAN_LINKS` rows complete only when
    // their plan action is done, so this read depends on `plan_items` as well as
    // documents. Nothing that could be uploaded moves this row.
    const before = readOf();
    expect(keysOf(before.apply.rows)).toContain("doc-preparation");
    expect(readOf({ planStates: { "doc-preparation": "open" } }).apply.ready).toBe(before.apply.ready);
    expect(readOf({ planStates: { "doc-preparation": "done" } }).apply.ready).toBe(before.apply.ready + 1);
  });
});

describe("MV-199 — every input moves the output", () => {
  it("an uploaded document", () => {
    expect(readOf({ uploadedKinds: new Set<DocumentKind>(["passport"]) }).apply.ready).toBe(
      readOf().apply.ready + 1,
    );
  });

  it("a self-reported document, which is not a file", () => {
    expect(readOf({ obtainedKinds: new Set<DocumentKind>(["national-id"]) }).apply.ready).toBe(
      readOf().apply.ready + 1,
    );
  });

  it("the profile's funding source, which changes the DENOMINATOR itself", () => {
    const generic = readOf();
    const family = readOf({ sections: { finance: { source: "parents-family" } } });
    expect(family.apply.total).toBe(generic.apply.total + 1);
    expect(keysOf(family.apply.rows)).toContain("fin-sponsor");
  });
});

describe("MV-199 — the single blocking item, and the rule that picks it", () => {
  it("is the RANKED-first outstanding row, not the first one the generator happened to emit", () => {
    // The discriminator. With the passport in, the generator's next outstanding row is
    // `national-id`; the authored rule says the English test blocks harder, because a
    // sitting has to be booked and sat and a citizenship copy does not. If the rule were
    // ever quietly replaced by array order, this is the test that would say so.
    const read = readOf({ uploadedKinds: new Set<DocumentKind>(["passport"]) });
    expect(keysOf(read.apply.rows.filter((r) => !r.done))[0]).toBe("national-id");
    expect(read.blocker?.key).toBe("english");
  });

  it("is always a row that counted — never an uncompletable reference row", () => {
    const read = readOf();
    expect(keysOf(read.apply.rows)).toContain(read.blocker!.key);
  });

  it("comes from the APPLY stage while the apply stage is incomplete", () => {
    // Every after-offer row is outstanding too, and all of them are unobtainable until
    // an offer exists. Naming one of those as the blocker would send a counsellor to
    // chase a document nobody can produce yet.
    const read = readOf();
    expect(read.lodge.rows.every((r) => !r.done)).toBe(true);
    expect(keysOf(read.apply.rows)).toContain(read.blocker!.key);
  });

  it("moves to the LODGE stage once the apply stage is complete", () => {
    const read = readOf({
      uploadedKinds: new Set<DocumentKind>(["passport", "national-id", "bachelors-transcript", "ielts", "bank-statement"]),
      planStates: { "doc-preparation": "done" },
    });
    expect(read.apply.complete).toBe(true);
    expect(keysOf(read.lodge.rows)).toContain(read.blocker!.key);
    expect(read.blocker!.key).toBe("offer-letter");
  });

  it("is null when nothing is outstanding at either stage", () => {
    const read = readOf({
      uploadedKinds: new Set<DocumentKind>([
        "passport", "national-id", "bachelors-transcript", "ielts", "bank-statement",
        "offer-letter", "coe", "oshc", "medical",
      ]),
      planStates: {
        "doc-preparation": "done", "noc-application": "done",
        "gs-responses": "done", biometrics: "done",
      },
    });
    expect(read.apply.complete).toBe(true);
    expect(read.lodge.complete).toBe(true);
    expect(read.blocker).toBeNull();
  });

  it("RANKS EVERY row the generator can require — a new row cannot fall silently to last", () => {
    // There is no rank, priority, weight or severity on a `ChecklistItem` (measured), so
    // this order is authored here and nowhere else. That makes it possible for a future
    // checklist row to be required, countable, and unranked — which would sort it last
    // and quietly make it un-nameable as a blocker. This is the guard against that.
    const unranked = new Set<string>();
    for (const level of ["bachelors", "masters", "doctorate"] as const) {
      for (const field of ["computer-science", "nursing"]) {
        for (const source of [undefined, ...FUNDING_SOURCES]) {
          for (const test of [undefined, "ielts", "pte", "toefl"] as const) {
            const items = generateChecklist({
              program: { ...masters, level, field },
              sections: {
                ...(source ? { finance: { source } } : {}),
                ...(test ? { english: { test } } : {}),
              },
              uploadedKinds: new Set<DocumentKind>(),
            });
            for (const item of items) {
              if (completion(item, {}) === null) continue;
              if (!BLOCKER_RANK_ORDER.includes(item.key)) unranked.add(item.key);
            }
          }
        }
      }
    }
    expect([...unranked]).toEqual([]);
  });
});

describe("MV-199 — provenance where it exists, and only there", () => {
  it("a sourced row carries its citation; an unsourced one makes no sourced claim", () => {
    const rows = readOf().apply.rows;
    const sourced = rows.find((r) => r.key === "doc-preparation");
    expect(sourced?.source?.url).toMatch(/^https?:\/\//);
    expect(sourced?.source?.lastVerified).toBeTruthy();
    // Measured: coverage is partial. `national-id` has no source in the generator, and
    // borrowing a neighbour's would be a fabricated citation.
    expect(rows.find((r) => r.key === "national-id")?.source).toBeUndefined();
  });
});
