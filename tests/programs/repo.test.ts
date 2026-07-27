import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  listAllPrograms,
  listProgramsForField,
  listProgramsForUniversity,
  getProgram,
  listAllUniversities,
} from "@/lib/programs/repo";
import { CatalogReadError } from "@/lib/programs/errors";
import { fakeSupabase } from "../helpers/fake-supabase";

describe("programs repo", () => {
  it("listAllPrograms returns mapped programs", async () => {
    const { client } = fakeSupabase({
      data: [
        {
          id: "p1",
          university_id: "u1",
          name: "X",
          level: "masters",
          field: "computer-science",
          tuition_min: 40000,
          tuition_max: null,
          tuition_currency: "AUD",
          min_grade: 65,
          min_english: 6.5,
          min_english_band: 6.0,
          intakes: ["feb"],
          source: null,
          last_verified: null,
          data_quality: "primary",
          notes: null,
        },
      ],
      error: null,
    });
    const out = await listAllPrograms(client);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("p1");
    expect(out[0]!.tuitionMin).toBe(40000);
    expect(out[0]!.tuitionMax).toBeNull();
  });

  // MV-133: a failed read must never look like an empty catalogue. Downstream, [] renders
  // "no programs found" — a confident false negative that tells the student the product has
  // nothing for them during what is really a transient outage.
  it("listAllPrograms throws CatalogReadError on a read error, never []", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(listAllPrograms(client)).rejects.toThrow(CatalogReadError);
  });

  it("listAllPrograms returns [] when the query succeeds with no rows", async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await listAllPrograms(client)).toEqual([]);
  });

  it("listProgramsForField throws CatalogReadError on a read error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(listProgramsForField(client, "computer-science")).rejects.toThrow(
      CatalogReadError,
    );
  });

  it("listProgramsForUniversity throws CatalogReadError on a read error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(listProgramsForUniversity(client, "u1")).rejects.toThrow(CatalogReadError);
  });

  it("listAllUniversities throws CatalogReadError on a read error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(listAllUniversities(client)).rejects.toThrow(CatalogReadError);
  });

  // "This program does not exist" and "we couldn't reach the catalogue" are different
  // answers: the first is a truthful 404, the second must not be dressed up as one.
  it("getProgram throws CatalogReadError on a read error but returns null when absent", async () => {
    const failing = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(getProgram(failing.client, "p1")).rejects.toThrow(CatalogReadError);

    const missing = fakeSupabase({ data: null, error: null });
    expect(await getProgram(missing.client, "p1")).toBeNull();
  });

  it("CatalogReadError names the table it failed to read", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    await expect(listAllUniversities(client)).rejects.toMatchObject({ table: "universities" });
  });

  it("listProgramsForField filters by field", async () => {
    const { client, calls } = fakeSupabase({ data: [], error: null });
    await listProgramsForField(client, "computer-science");
    expect(
      calls.some(
        (c) => c.method === "eq" && c.args[0] === "field" && c.args[1] === "computer-science",
      ),
    ).toBe(true);
  });

  it("getProgram by id", async () => {
    const { client } = fakeSupabase({
      data: {
        id: "p1",
        university_id: "u1",
        name: "X",
        level: "masters",
        field: "x",
        tuition_min: null,
        tuition_max: null,
        tuition_currency: "AUD",
        min_grade: null,
        min_english: null,
        min_english_band: null,
        intakes: [],
        source: null,
        last_verified: null,
        data_quality: "primary",
        notes: null,
      },
      error: null,
    });
    const out = await getProgram(client, "p1");
    expect(out?.id).toBe("p1");
  });

  it("listAllUniversities returns mapped universities", async () => {
    const { client } = fakeSupabase({
      data: [
        {
          id: "u1",
          country: "AU",
          name: "X",
          city: "Y",
          ranking_tier: 1,
          source: null,
          last_verified: null,
          data_quality: "primary",
          created_at: "",
          updated_at: "",
        },
      ],
      error: null,
    });
    const out = await listAllUniversities(client);
    expect(out[0]!.id).toBe("u1");
  });
});
