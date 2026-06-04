import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  listAllPrograms,
  listProgramsForField,
  getProgram,
  listAllUniversities,
} from "@/lib/programs/repo";
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

  it("listAllPrograms returns [] on error", async () => {
    const { client } = fakeSupabase({ data: null, error: { message: "boom" } });
    expect(await listAllPrograms(client)).toEqual([]);
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
