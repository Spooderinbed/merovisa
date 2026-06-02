import type { DestinationCountryData } from "../types";

export const AUSTRALIA: DestinationCountryData = {
  id: "australia",
  name: "Australia",
  flag: "🇦🇺",
  tuitionRangeUsd: { min: 22000, max: 45000 },
  livingRangeUsd: { min: 14000, max: 22000 },
  englishThreshold: 6.5,
  visaProcessingWeeks: { min: 4, max: 8 },
  intakes: [
    { name: "February", month: 2, deadlineWeeksBefore: 16 },
    { name: "July", month: 7, deadlineWeeksBefore: 16 },
  ],
  source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
  lastVerified: "2026-06-02",
};
