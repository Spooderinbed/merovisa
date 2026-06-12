import type { Sourced } from "@/lib/data/types";

/**
 * DHA's Document Checklist Tool — the public mechanism that turns country of
 * passport + education provider into the exact attachment list for a Subclass
 * 500 application (financial-capacity evidence included). DHA does not publish
 * evidence levels, so this tool is the primary channel a student can actually
 * check; the policy banner renders it beside the scrutiny line (F2-A apply,
 * brief: docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md).
 */
export const AU_DOCUMENT_CHECKLIST_TOOL: Sourced<string> = {
  value: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool",
  provenance: {
    findingRefs: ["C.146", "I.021", "I.022", "I.023", "I.024"],
    source: "https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool",
    lastVerified: "2026-06-12",
    note: "Generates the per-combination evidence list; its financial-capacity entry covers travel, 12 months living costs, tuition and school costs, or the parent/spouse income method.",
  },
};
