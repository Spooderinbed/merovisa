import type { Program } from "@/lib/programs/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { DocumentKind } from "@/lib/documents/types";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { NEPAL_L3_BANK_SEASONING_MONTHS } from "@/lib/programs/policy";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import type {
  ChecklistItem,
  ChecklistRequirement,
  ChecklistSource,
  ChecklistStatus,
} from "./types";

export interface ChecklistInputs {
  program: Program;
  sections: ProfileSections;
  uploadedKinds: Set<DocumentKind>;
  nepalAssessmentLevel?: "L2" | "L3";
}

const DHA_SOURCE: ChecklistSource = {
  url: AU_DHA_LIVING_CAPACITY_AUD.provenance.source ?? "",
  lastVerified: AU_DHA_LIVING_CAPACITY_AUD.provenance.lastVerified,
};

const VISA_REQ = Object.fromEntries(AU_STUDENT_VISA_REQUIREMENTS.map((r) => [r.id, r]));
const reqSource = (id: string): ChecklistSource | undefined => {
  const r = VISA_REQ[id];
  return r ? { url: r.source, lastVerified: r.lastVerified } : undefined;
};

function statusFor(kind: DocumentKind | null, uploaded: Set<DocumentKind>): ChecklistStatus {
  if (kind === null) return "info";
  return uploaded.has(kind) ? "have" : "missing";
}

export function generateChecklist(inputs: ChecklistInputs): ChecklistItem[] {
  const { program, sections, uploadedKinds } = inputs;
  const level = inputs.nepalAssessmentLevel ?? "L3";
  const items: ChecklistItem[] = [];
  const add = (it: Omit<ChecklistItem, "status">) =>
    items.push({ ...it, status: statusFor(it.kind, uploadedKinds) });

  // IDENTITY (now)
  add({ key: "passport", kind: "passport", label: "Passport bio page", group: "identity", stage: "now", requirement: "required" });
  add({ key: "national-id", kind: "national-id", label: "Citizenship / National ID", group: "identity", stage: "now", requirement: "required" });
  add({ key: "birth-certificate", kind: "birth-certificate", label: "Birth certificate", group: "identity", stage: "now", requirement: "recommended" });

  // ACADEMIC (now, by level)
  if (program.level === "bachelors") {
    add({ key: "plus-two", kind: "plus-two", label: "+2 / Higher Secondary", group: "academic", stage: "now", requirement: "required" });
    add({ key: "slc-see", kind: "slc-see", label: "SLC / SEE certificate", group: "academic", stage: "now", requirement: "required" });
  } else {
    if (program.level === "doctorate") {
      add({ key: "masters-transcript", kind: "masters-transcript", label: "Master's transcript", group: "academic", stage: "now", requirement: "required" });
    }
    add({ key: "bachelors-transcript", kind: "bachelors-transcript", label: "Bachelor's transcript", group: "academic", stage: "now", requirement: "required" });
    add({ key: "plus-two", kind: "plus-two", label: "+2 / Higher Secondary", group: "academic", stage: "now", requirement: "recommended" });
    add({ key: "slc-see", kind: "slc-see", label: "SLC / SEE certificate", group: "academic", stage: "now", requirement: "recommended" });
  }

  // ENGLISH (now)
  const testKind: DocumentKind =
    sections.english?.test === "pte" ? "pte" : sections.english?.test === "toefl" ? "toefl" : "ielts";
  const isNursing = program.field === "nursing";
  let englishNote: string;
  if (program.minEnglish != null) {
    const band = program.minEnglishBand != null ? `, each band ≥ ${program.minEnglishBand}` : "";
    englishNote = `This program lists ${testKind.toUpperCase()} ${program.minEnglish}${band}.`;
  } else {
    englishNote = "Most Australian programs require an English test for both admission and the visa.";
  }
  if (isNursing) englishNote += " Nursing programs typically require each band ≥ 7.";
  add({
    key: "english",
    kind: testKind,
    label: testKind === "ielts" ? "IELTS scorecard (or PTE / TOEFL)" : testKind === "pte" ? "PTE Academic scorecard" : "TOEFL iBT report",
    group: "english", stage: "now", requirement: "required",
    note: englishNote,
    source: program.source ? { url: program.source, lastVerified: program.lastVerified || undefined } : undefined,
  });
  if (isNursing) {
    add({ key: "ahpra", kind: null, label: "AHPRA registration", group: "academic", stage: "now", requirement: "required", note: "Nursing programs require registration with the Australian Health Practitioner Regulation Agency (AHPRA)." });
  }

  // FINANCIAL (now, by funding source)
  const tuition = program.tuitionMin != null ? `AUD ${program.tuitionMin.toLocaleString()}` : "first-year tuition";
  const dhaNote = `DHA expects evidence covering your travel, at least AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living costs, and ${tuition} (plus costs for any accompanying family members).`;
  const seasoning = level === "L3" ? ` Under Nepal Assessment Level 3, season your balance for ${NEPAL_L3_BANK_SEASONING_MONTHS} months with source-of-funds evidence.` : "";
  const financeNote = dhaNote + seasoning;
  let financeNoteAttached = false;
  const addFinance = (key: string, kind: DocumentKind | null, label: string, requirement: ChecklistRequirement) => {
    const isFirstRequired = requirement === "required" && !financeNoteAttached;
    if (isFirstRequired) financeNoteAttached = true;
    add({
      key, kind, label, group: "financial", stage: "now", requirement,
      note: isFirstRequired ? financeNote : undefined,
      source: isFirstRequired ? DHA_SOURCE : undefined,
    });
  };
  switch (sections.finance?.source) {
    case "self-funded":
      addFinance("fin-bank", "bank-statement", "Bank statement", "required");
      break;
    case "parents-family":
      addFinance("fin-bank", "bank-statement", "Bank statement", "required");
      addFinance("fin-sponsor", "sponsor-income", "Sponsor income (tax return)", "required");
      break;
    case "education-loan":
      addFinance("fin-loan", "loan-sanction", "Education loan sanction letter", "required");
      addFinance("fin-bank", "bank-statement", "Bank statement", "recommended");
      break;
    case "mixed":
      addFinance("fin-bank", "bank-statement", "Bank statement", "required");
      addFinance("fin-loan", "loan-sanction", "Education loan sanction letter", "required");
      addFinance("fin-sponsor", "sponsor-income", "Sponsor income (tax return)", "recommended");
      break;
    case "scholarship-dependent":
      addFinance("fin-scholarship", null, "Scholarship / sponsorship award letter", "required");
      addFinance("fin-bank", "bank-statement", "Bank statement (living-cost gap)", "recommended");
      break;
    default:
      addFinance("fin-bank", "bank-statement", "Proof of funds (bank statement, loan sanction, or sponsor income)", "required");
  }

  // EMPLOYMENT (now, conditional)
  const hasWork = !!sections.work?.title;
  const hasGap = (sections.gap?.years ?? 0) >= 1;
  if (hasWork || hasGap) {
    add({
      key: "employment-letter", kind: "employment-letter", label: "Employment letter", group: "employment", stage: "now", requirement: "recommended",
      note: hasGap ? "Evidence for your study gap (employment letter, salary slips)." : "Strengthens admissions and your Genuine Student narrative.",
    });
    if (hasWork) {
      add({ key: "salary-slip", kind: "salary-slip", label: "Salary slips", group: "employment", stage: "now", requirement: "recommended" });
    }
  }

  // VISA (after-offer)
  add({ key: "offer-letter", kind: "offer-letter", label: "University offer letter", group: "visa", stage: "after-offer", requirement: "required", note: "Issued when a university accepts you." });
  add({ key: "coe", kind: "coe", label: "Confirmation of Enrolment (CoE)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["coe"]!.summary, source: reqSource("coe") });
  add({ key: "oshc", kind: "oshc", label: "Overseas Student Health Cover (OSHC)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["oshc"]!.summary, source: reqSource("oshc") });
  add({ key: "medical", kind: "medical", label: "Panel medical exam", group: "visa", stage: "after-offer", requirement: "required", note: "When DHA requests it." });

  return items;
}
