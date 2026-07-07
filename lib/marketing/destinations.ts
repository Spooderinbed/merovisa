export type MarketingMatch = "strong" | "possible" | "reach";
export type RiskLevel = "calm" | "caution" | "warning";

export interface MarketingDestination {
  id: string;
  /** Whether the assessment engine fully covers this corridor end-to-end (only Australia today). */
  supported: boolean;
  name: string;
  flag: string;
  iso: string;
  tagline: string;
  match: MarketingMatch;
  tuition: string;
  living: string;
  financialProof: string;
  workRights: string;
  postStudy: string;
  risk: { level: RiskLevel; title: string; body: string };
  source: string;
  lastVerified: string;
  docs: string[];
}

export const MARKETING_DESTINATIONS: MarketingDestination[] = [
  {
    id: "au",
    supported: true,
    name: "Australia",
    flag: "🇦🇺",
    iso: "AU",
    tagline: "Strong post-study work rights, clear financial rules.",
    match: "strong",
    tuition: "A$33k–48k / yr",
    living: "A$29,710 / yr (proof required)",
    financialProof: "A$29,710 for living + first-year tuition + travel",
    workRights: "48 hrs / fortnight during term, unlimited in breaks",
    postStudy: "Temporary Graduate visa (485): 2–4 yrs",
    risk: {
      level: "caution",
      title: "Genuine Student (GS) requirement replaced GTE",
      body: "Since 2024 the Genuine Student requirement and higher savings thresholds apply. A clearly explained study gap strengthens your case.",
    },
    source: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
    lastVerified: "2026-05-28",
    docs: ["Valid passport", "Offer letter (CoE)", "Genuine Student statement", "Proof of funds (A$29,710+)", "IELTS/PTE results", "OSHC health cover", "Academic transcripts"],
  },
  {
    id: "ca",
    supported: false,
    name: "Canada",
    flag: "🇨🇦",
    iso: "CA",
    tagline: "Provincial caps in effect — apply early.",
    match: "possible",
    tuition: "C$25k–38k / yr",
    living: "C$20,635 / yr (proof required)",
    financialProof: "C$20,635 living + tuition (outside Quebec)",
    workRights: "Up to 24 hrs / week off-campus during term",
    postStudy: "PGWP: up to 3 yrs (field-of-study rules apply)",
    risk: {
      level: "warning",
      title: "Provincial Attestation Letter (PAL) required",
      body: "IRCC capped study permits in 2024; every applicant needs a PAL from the province. Choose DLIs with available allocation early.",
    },
    source: "https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit.html",
    lastVerified: "2026-05-30",
    docs: ["Valid passport", "Letter of Acceptance", "Provincial Attestation Letter", "Proof of funds (C$20,635+)", "IELTS/CELPIP results", "Medical exam", "Statement of purpose"],
  },
  {
    id: "uk",
    supported: false,
    name: "United Kingdom",
    flag: "🇬🇧",
    iso: "GB", // GB is the ISO 3166-1 alpha-2 code for the UK (informal alt "UK"); the id stays "uk".
    tagline: "Fast visa decisions; dependant rules tightened.",
    match: "possible",
    tuition: "£16k–32k / yr",
    living: "£12,006–13,348 / yr (proof required)",
    financialProof: "£12,006 outside London / £13,348 inside London (9 months) + first-year tuition",
    workRights: "20 hrs / week during term",
    postStudy: "Graduate Route: 2 yrs (3 yrs for PhD)",
    risk: {
      level: "caution",
      title: "Dependant visa restricted to research postgrad",
      body: "Since Jan 2024 only research-based postgraduate students can bring dependants. Plan accordingly if family is part of your move.",
    },
    source: "https://www.gov.uk/student-visa",
    lastVerified: "2026-05-26",
    docs: ["Valid passport", "CAS letter", "Proof of funds (28-day rule)", "IELTS for UKVI", "ATAS clearance (if applicable)", "TB test results", "Academic transcripts"],
  },
  {
    id: "de",
    supported: false,
    name: "Germany",
    flag: "🇩🇪",
    iso: "DE",
    tagline: "Low/no tuition at public universities.",
    match: "reach",
    tuition: "€0–3k / yr (public)",
    living: "€11,904 / yr (blocked account)",
    financialProof: "€11,904 in a blocked account (Sperrkonto)",
    workRights: "120 full / 240 half-days per year",
    postStudy: "18-month job-seeker residence permit",
    risk: {
      level: "caution",
      title: "German language often required for undergrad",
      body: "Many bachelor's programmes still require German B2/C1. English-taught master's are common but competitive — check programme by programme.",
    },
    source: "https://www.auswaertiges-amt.de/en/visa-service/-/231148",
    lastVerified: "2026-05-22",
    docs: ["Valid passport", "University admission letter", "Blocked account (€11,904)", "APS certificate (for India/China/Vietnam)", "TestDaF / DSH (or IELTS for English programmes)", "Health insurance", "CV + motivation letter"],
  },
  {
    id: "us",
    supported: false,
    name: "United States",
    flag: "🇺🇸",
    iso: "US",
    tagline: "Largest choice; interview-based visa.",
    match: "reach",
    tuition: "$28k–60k / yr",
    living: "$15k–22k / yr",
    financialProof: "Tuition + living for the entire course shown on the I-20",
    workRights: "On-campus only first year (20 hrs / week)",
    postStudy: "OPT: 12 months (+24 for STEM)",
    risk: {
      level: "warning",
      title: "F-1 visa interview is the bottleneck",
      body: "Approval depends heavily on demonstrating non-immigrant intent and clear ties home. Refusal rates vary by consulate and month.",
    },
    source: "https://travel.state.gov/content/travel/en/us-visas/study/student-visa.html",
    lastVerified: "2026-05-29",
    docs: ["Valid passport", "I-20 from SEVP school", "SEVIS I-901 fee receipt", "DS-160 confirmation", "Proof of funds for full programme", "TOEFL/IELTS", "Academic transcripts + test scores"],
  },
  {
    id: "ie",
    supported: false,
    name: "Ireland",
    flag: "🇮🇪",
    iso: "IE",
    tagline: "English-speaking EU; growing tech sector.",
    match: "possible",
    tuition: "€10k–25k / yr",
    living: "€10,000 / yr (proof required)",
    financialProof: "€10,000 + first-year tuition",
    workRights: "20 hrs / week during term, 40 hrs in breaks",
    postStudy: "Stay-Back: 1 yr (master's: 2 yrs)",
    risk: {
      level: "calm",
      title: "No recent rule changes",
      body: "Visa policy has been stable. Watch the Garda registration (IRP) queue once you arrive — book early.",
    },
    source: "https://www.irishimmigration.ie/coming-to-study-in-ireland/",
    lastVerified: "2026-05-20",
    docs: ["Valid passport", "Letter of acceptance", "Proof of funds (€10,000+)", "IELTS/TOEFL", "Private medical insurance", "Statement of purpose", "Academic transcripts"],
  },
];

export function getMarketingDestination(id: string): MarketingDestination | null {
  return MARKETING_DESTINATIONS.find((c) => c.id === id) ?? null;
}
