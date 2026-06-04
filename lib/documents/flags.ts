import type { DocumentKind } from "./types";
import type { SectionKey } from "@/lib/profiles/sections";

export interface DocumentFlag {
  section: SectionKey;
  field: string;
  groupKinds: DocumentKind[];
}

const ENGLISH_REPORT_KINDS: DocumentKind[] = ["ielts", "pte", "toefl"];
const FINANCE_PROOF_KINDS: DocumentKind[] = ["bank-statement", "loan-sanction", "sponsor-income"];
const WORK_DOCS_KINDS: DocumentKind[] = ["employment-letter", "salary-slip"];

export function getFlagForKind(kind: DocumentKind): DocumentFlag | null {
  if (ENGLISH_REPORT_KINDS.includes(kind)) {
    return { section: "english", field: "reportUploaded", groupKinds: ENGLISH_REPORT_KINDS };
  }
  if (FINANCE_PROOF_KINDS.includes(kind)) {
    return { section: "finance", field: "proofUploaded", groupKinds: FINANCE_PROOF_KINDS };
  }
  if (WORK_DOCS_KINDS.includes(kind)) {
    return { section: "work", field: "docs", groupKinds: WORK_DOCS_KINDS };
  }
  return null;
}
