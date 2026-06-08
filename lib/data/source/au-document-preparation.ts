import type { AuDocumentPreparation } from "@/lib/data/types";

/**
 * DHA document-preparation rules (logistics category A) for making Nepali-language
 * documents acceptable to an Australian student-visa application. Three translation
 * rules (A.026–A.028) and two certified-copy rules (A.041–A.042), consumed by the
 * checklist + plan generators. Fact-only — no scorer reads it; machine-checked against
 * findings A.026–A.028, A.041–A.042 (see provenance.findingRefs).
 *
 * `translation-rule` summaries are standalone sentences (joined by a space).
 * `certified-copy` summaries are bare document nouns so the generators can frame them
 * as "certified copies of some identity documents, including your …" — keeping
 * certification scoped to those named identity documents rather than implying every
 * translated document must be certified.
 */
const DHA_POPULAR = "https://immi.homeaffairs.gov.au/help-support/popular-questions";
const DHA_VISITOR = "https://immi.homeaffairs.gov.au/check-twice-submit-once/visitor-visa";
const DHA_EVIDENTIARY = "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool";

export const AU_DOCUMENT_PREPARATION: AuDocumentPreparation[] = [
  {
    id: "translate-non-english",
    kind: "translation-rule",
    label: "Translate non-English documents",
    summary: "Any document not in English must be translated into English.",
    source: DHA_POPULAR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.026"],
      source: DHA_POPULAR,
      note: "DHA popular-questions page: all documents not in English must be translated into English.",
    },
  },
  {
    id: "submit-original-and-translation",
    kind: "translation-rule",
    label: "Original + translation",
    summary: "Submit both the original document and its English translation.",
    source: DHA_POPULAR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.027"],
      source: DHA_POPULAR,
      note: "DHA popular-questions page: both the original non-English document and the translation must be submitted.",
    },
  },
  {
    id: "overseas-translator-details",
    kind: "translation-rule",
    label: "Overseas translator details",
    summary:
      "If your translator is outside Australia, include their full name, address, phone number, and qualifications.",
    source: DHA_VISITOR,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.028"],
      source: DHA_VISITOR,
      note: "DHA visa-document guidance: a translator outside Australia must provide full name, address, phone number, and qualifications in the source language.",
    },
  },
  {
    id: "certified-copy-birth-certificate",
    kind: "certified-copy",
    label: "Certified birth certificate",
    summary: "birth certificate",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.041"],
      source: DHA_EVIDENTIARY,
      note: "DHA student-document checklist: include a certified copy of your birth certificate where you have one.",
    },
  },
  {
    id: "certified-copy-national-id",
    kind: "certified-copy",
    label: "Certified national ID",
    summary: "national identity card",
    source: DHA_EVIDENTIARY,
    lastVerified: "2026-06-05",
    provenance: {
      findingRefs: ["A.042"],
      source: DHA_EVIDENTIARY,
      note: "DHA student-document checklist: include a certified copy of your national identity card where you have one.",
    },
  },
];
