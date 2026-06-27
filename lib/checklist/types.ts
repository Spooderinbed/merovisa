import type { DocumentKind, DocumentKindMeta } from "@/lib/documents/types";

export type ChecklistStage = "now" | "after-offer";
export type ChecklistRequirement = "required" | "recommended";
// "have" = an uploaded file backs it; "obtained" = the student self-reported it on the
// global checklist (no file) — kept distinct so self-report never reads as uploaded evidence.
export type ChecklistStatus = "have" | "obtained" | "missing" | "info";
export type ChecklistInfoKind = "step" | "note";

/** Maps directly onto the SourceLine component's props. */
export interface ChecklistSource {
  url: string;
  lastVerified?: string;
}

export interface ChecklistItem {
  key: string; // stable id (tests + React keys)
  kind: DocumentKind | null; // null = informational, no vault binding
  label: string;
  group: DocumentKindMeta["group"]; // identity | academic | english | financial | employment | visa | other
  stage: ChecklistStage;
  requirement: ChecklistRequirement;
  status: ChecklistStatus; // have/obtained/missing when kind != null; "info" when kind == null
  note?: string;
  source?: ChecklistSource;
  infoKind?: ChecklistInfoKind; // set when kind === null; drives the Step/Note chip
}
