import { describe, it, expect } from "vitest";
import {
  NEPAL_ASSESSMENT_LEVEL, DHA_LIVING_COSTS_AUD, tuPctToAuWamBand,
} from "@/lib/programs/policy";

describe("policy constants", () => {
  it("Nepal is at Assessment Level 3", () => {
    expect(NEPAL_ASSESSMENT_LEVEL).toBe("L3");
  });

  it("DHA living costs are AUD 29,710", () => {
    expect(DHA_LIVING_COSTS_AUD).toBe(29_710);
  });
});

describe("tuPctToAuWamBand", () => {
  it("80% TU maps to Distinction (≥75 WAM)", () => {
    expect(tuPctToAuWamBand(80)).toEqual({ auWam: ">=75", auGrade: "Distinction" });
  });
  it("72% TU maps to Credit (65-74 WAM)", () => {
    expect(tuPctToAuWamBand(72)).toEqual({ auWam: "65-74", auGrade: "Credit" });
  });
  it("65% TU maps to Pass (50-64 WAM) — conservative per research §3.4", () => {
    expect(tuPctToAuWamBand(65)).toEqual({ auWam: "50-64", auGrade: "Pass" });
  });
  it("40% TU maps to Fail", () => {
    expect(tuPctToAuWamBand(40)).toEqual({ auWam: "<50", auGrade: "Fail" });
  });
});
