import type { AuTemporaryGraduateVisaFact } from "@/lib/data/types";

/**
 * Australian Temporary Graduate visa (Subclass 485) reference facts, from the
 * Department of Home Affairs visa-listing pages. A visa-level overview record
 * holds the shared facts (base application charge, age cap); one record per DHA
 * stream holds that stream's stay period and family rights.
 *
 * Stay periods preserve the unit DHA states: the Post-Higher Education Work
 * stream is a 2-to-3-year range (minStayYears/maxStayYears); the Post-Vocational
 * Education Work stream is a single "up to 18 months" cap (maxStayMonths).
 *
 * Fact-only — no scorer reads it; it backs the eventual post-study-work view and
 * is machine-checked against the findings.
 */
const VISA_485_BASE =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485";
const POST_HIGHER_EDUCATION_WORK = `${VISA_485_BASE}/post-higher-education-work`;
const POST_VOCATIONAL_EDUCATION_WORK = `${VISA_485_BASE}/post-vocational-education-work`;
const SECOND_POST_HIGHER_EDUCATION_WORK = `${VISA_485_BASE}/second-post-higher-education-work`;

export const AU_TEMPORARY_GRADUATE_VISA: AuTemporaryGraduateVisaFact[] = [
  {
    id: "subclass-485-overview",
    subclass: "485",
    baseApplicationChargeAud: 4600,
    maxAgeYears: 35,
    source: VISA_485_BASE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.038", "C.042", "C.043"],
      note: "Base application charge is a 'from AUD 4,600.00' figure; applicants must generally be aged 35 or under unless an exception applies.",
    },
  },
  {
    id: "subclass-485-post-higher-education-work",
    subclass: "485",
    stream: "Post-Higher Education Work",
    minStayYears: 2,
    maxStayYears: 3,
    bringsFamily: true,
    source: POST_HIGHER_EDUCATION_WORK,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.039", "E.015", "C.046"],
      note: "Stay of 2 to 3 years depending on the qualification; the holder may include family members.",
    },
  },
  {
    id: "subclass-485-post-vocational-education-work",
    subclass: "485",
    stream: "Post-Vocational Education Work",
    maxStayMonths: 18,
    source: POST_VOCATIONAL_EDUCATION_WORK,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.040", "E.016"],
      note: "Usually permits a stay of up to 18 months.",
    },
  },
  {
    id: "subclass-485-second-post-higher-education-work",
    subclass: "485",
    stream: "Second Post-Higher Education Work",
    bringsFamily: true,
    source: SECOND_POST_HIGHER_EDUCATION_WORK,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["C.041", "C.047"],
      note: "A second 485 in the Post-Higher Education Work stream; the holder may include family members.",
    },
  },
];
