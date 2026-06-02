import type { SourceCountryData } from "../types";

export const NEPAL: SourceCountryData = {
  id: "nepal",
  name: "Nepal",
  flag: "🇳🇵",
  gradeSystems: ["percentage-nepal", "cgpa-4"],
  defaultGradeSystem: "percentage-nepal",
  testCenters: {
    ielts: ["British Council, Kathmandu", "IDP, Kathmandu", "IDP, Pokhara"],
  },
  source: "https://www.britishcouncil.org.np/exam/ielts",
  lastVerified: "2026-06-02",
};
