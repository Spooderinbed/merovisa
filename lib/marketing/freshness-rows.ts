// lib/marketing/freshness-rows.ts
import type { Sourced } from "./provenance";

export interface FreshnessRow extends Sourced {
  key: string;
  value: string;
  detail: string;
  nextCheck: string;
}

export const FRESHNESS_ROWS: FreshnessRow[] = [
  {
    kind: "sourced",
    key: "Living-cost requirement",
    value: "A$29,710",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Department of Home Affairs, the 12-month living-cost figure a student must evidence for a visa. What we check: the published amount and its effective date.",
  },
  {
    kind: "sourced",
    key: "Genuine Student (GS)",
    value: "s.500 criteria",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Migration Regulations s.500 and Home Affairs Genuine Student guidance. What we check: the factors an officer applies to judge study intent.",
  },
  {
    kind: "sourced",
    key: "Avg. first-year tuition",
    value: "≈ A$33,000",
    source: "University data",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: published fee schedules across shortlisted universities. What we check: indicative first-year tuition, which varies by program.",
  },
  {
    kind: "sourced",
    key: "Post-study work (485)",
    value: "2–4 years",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Home Affairs Temporary Graduate visa (subclass 485). What we check: post-study work duration by qualification level.",
  },
  {
    kind: "sourced",
    key: "Health cover (OSHC)",
    value: "required",
    source: "Home Affairs",
    verified: "Jun 2026",
    nextCheck: "Jul 2026",
    detail: "Source: Home Affairs student visa conditions. What we check: that Overseas Student Health Cover is required for the visa duration.",
  },
];
