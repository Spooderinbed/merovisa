import type { AuEnglishTest } from "@/lib/data/types";

/**
 * English-language tests and whether the Australian Department of Home Affairs
 * (DHA) accepts each one for the Subclass 500 student visa, per the DHA
 * specified-instrument list effective 7 August 2025, with DHA's minimum
 * component scores where the test sets numeric thresholds. One record per test.
 * The acceptance boolean is the machine-checked fact; component scores ride as
 * sourced detail from the same finding's caveat. Fact-only — no scorer reads it;
 * it backs the eventual English-requirements view and reconciles against findings.
 *
 * The two "not accepted" records (Duolingo, TOEFL Home Edition) are sourced from
 * non-government pages — see each record's provenance note.
 */
const DHA_ACCEPTED_TESTS_SOURCE = "https://immi.homeaffairs.gov.au/visa-eligibility/international";
const DHA_INSTRUMENT_EFFECTIVE = "2025-08-07";

export const AU_ENGLISH_TESTS: AuEnglishTest[] = [
  {
    id: "ielts-academic",
    testName: "IELTS Academic",
    acceptedByDha: true,
    minScores: { eachComponent: 6.0 },
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.003"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "DHA competent English = 6.0 in each component; admissions often require 6.5+. Includes One Skill Retake.",
    },
  },
  {
    id: "ielts-general-training",
    testName: "IELTS General Training",
    acceptedByDha: true,
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.004"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "Includes One Skill Retake.",
    },
  },
  {
    id: "pte-academic",
    testName: "Pearson PTE Academic",
    acceptedByDha: true,
    minScores: { listening: 47, reading: 48, writing: 51, speaking: 54 },
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.005"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "DHA competent English: ≥47 listening, 48 reading, 51 writing, 54 speaking (sum-equivalence to IELTS 6.0).",
    },
  },
  {
    id: "toefl-ibt",
    testName: "TOEFL iBT (in-person)",
    acceptedByDha: true,
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.006"],
      note: "Accepted only when taken in person at an authorised test centre; Home Edition scores are not accepted.",
    },
  },
  {
    id: "cambridge-c1-advanced",
    testName: "Cambridge C1 Advanced",
    acceptedByDha: true,
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.001"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "DHA instrument lists C1 Advanced as an accepted test (excludes the vocational-English category).",
    },
  },
  {
    id: "celpip-general",
    testName: "CELPIP General",
    acceptedByDha: true,
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: { findingRefs: ["J1.002"], effectiveDate: DHA_INSTRUMENT_EFFECTIVE },
  },
  {
    id: "oet",
    testName: "Occupational English Test (OET)",
    acceptedByDha: true,
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.007"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "DHA competent English = grade B in each component (non-numeric, so not modeled as a score). Nepal OET centres are not yet established.",
    },
  },
  {
    id: "languagecert-academic",
    testName: "LANGUAGECERT Academic",
    acceptedByDha: true,
    minScores: { listening: 57, reading: 60, writing: 64, speaking: 70 },
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.008"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "Added to the DHA instrument since August 2025; Nepal availability unclear.",
    },
  },
  {
    id: "met",
    testName: "Michigan English Test (MET)",
    acceptedByDha: true,
    minScores: { listening: 56, reading: 55, writing: 57, speaking: 48 },
    source: DHA_ACCEPTED_TESTS_SOURCE,
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.009"],
      effectiveDate: DHA_INSTRUMENT_EFFECTIVE,
      note: "MET test centres in Nepal are very limited, if any.",
    },
  },
  {
    id: "duolingo-det",
    testName: "Duolingo English Test",
    acceptedByDha: false,
    source: "https://aspireglobalpathways.com/ielts-alternative-for-australian-visa-2026/",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.010"],
      note: "Accepted by some universities for admission, but DHA does not accept it for the Subclass 500 visa. Source is a consultancy page (non-government).",
    },
  },
  {
    id: "toefl-ibt-home-edition",
    testName: "TOEFL iBT Home Edition",
    acceptedByDha: false,
    source: "https://www.in.ets.org/toefl/test-takers/ibt/where-to-study/study-in-australia.html",
    lastVerified: "2026-06-07",
    provenance: {
      findingRefs: ["J1.016"],
      note: "Home Edition (online-from-home) is explicitly not accepted; the test must be taken at an approved centre. Source is ETS (non-government).",
    },
  },
];
