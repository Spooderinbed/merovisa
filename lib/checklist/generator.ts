import type { Program } from "@/lib/programs/types";
import type { ProfileSections } from "@/lib/profiles/sections";
import type { DocumentKind } from "@/lib/documents/types";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { NEPAL_L3_BANK_SEASONING_MONTHS } from "@/lib/programs/policy";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";
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
const LIVING_COST_INDICATIVE = AU_FINANCIAL_EVIDENCE.find((e) => e.id === "living-cost-indicative")!;
const SOF_DEF = NEPAL_SOURCE_OF_FUNDS.find((r) => r.kind === "definition")!;
const SOF_PRIMARY = NEPAL_SOURCE_OF_FUNDS.find((r) => r.id === "noc-requirement")!; // NRB study page → item source
const SOF_REMITTANCE_NOTE =
  `${SOF_DEF.summary} Before releasing foreign currency, your bank requires ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ")}. ` +
  `${NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ")}`;

/** Join phrases as "a, b, and c" (Oxford "and"). */
function oxfordAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1]!;
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}

const NOC_PRIMARY = NEPAL_NOC_JOURNEY.find((r) => r.id === "noc-doc-citizenship")!; // MoEST portal → item source
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
const NOC_NOTE =
  "A No Objection Certificate (NOC) from Nepal's Ministry of Education clears you to study abroad, " +
  "and your bank needs it before releasing tuition or living expenses. " +
  `The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ${NOC_STEPS}`;

const DOC_PREP = AU_DOCUMENT_PREPARATION;
const DOC_PREP_PRIMARY = DOC_PREP.find((r) => r.id === "translate-non-english")!; // DHA popular-questions → item source
const TRANSLATION_RULES = DOC_PREP.filter((r) => r.kind === "translation-rule").map((r) => r.summary).join(" ");
const CERTIFIED_COPIES = DOC_PREP.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
const DOC_PREP_NOTE =
  `${TRANSLATION_RULES} DHA also asks for certified copies of some identity documents, ` +
  `including your ${oxfordAnd(CERTIFIED_COPIES)}.`;

const HEALTH_EXAM_PROCESS = AU_HEALTH_EXAM.filter((r) => r.kind === "process").map((r) => r.summary).join(" ");
const HEALTH_EXAM_UNDERTAKING = AU_HEALTH_EXAM.find((r) => r.id === "undertaking-validity")!.summary;
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092 (structured 12 months)
const HEALTH_EXAM_SOURCE = AU_HEALTH_EXAM.find((r) => r.id === "mhd-before-lodging")!; // DHA health page → item source
const MEDICAL_NOTE =
  `DHA may request a health examination as part of your application. ${HEALTH_EXAM_PROCESS} ` +
  `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit} — ${HEALTH_EXAM_UNDERTAKING}`;

const BIOMETRICS_LETTER = AU_BIOMETRICS.find((r) => r.id === "immi-app-biometrics-letter")!; // A.031
// Participation framed from C.123 (boolean — stated, not interpolated); the fee value +
// the item SourceLine come from C.127 (the most concrete/falsifiable claim — see the guard below).
const BIOMETRICS_FEE = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!; // C.127
const BIOMETRICS_NOTE =
  `Nepal takes part in Australia's biometrics program, so you'll give biometrics as part of your visa application. ` +
  `Expect a VFS Global collection fee of about ${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()} at the Kathmandu centre. ` +
  `${BIOMETRICS_LETTER.summary}`;

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
  add({
    key: "doc-preparation",
    kind: null,
    label: "Translations & certified copies",
    group: "identity",
    stage: "now",
    requirement: "required",
    note: DOC_PREP_NOTE,
    source: { url: DOC_PREP_PRIMARY.source, lastVerified: DOC_PREP_PRIMARY.lastVerified },
  });

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
  const dhaNote = `DHA expects evidence covering your travel, at least AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living costs, and ${tuition} (plus costs for any accompanying family members). ${LIVING_COST_INDICATIVE.summary}`;
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

  // Nepal-side remittance readiness (NRB rules) — unconditional reference note.
  add({
    key: "fin-nrb-remittance",
    kind: null,
    label: "NOC + institution documents",
    group: "financial",
    stage: "now",
    requirement: "required",
    note: SOF_REMITTANCE_NOTE,
    source: { url: SOF_PRIMARY.source, lastVerified: SOF_PRIMARY.lastVerified },
  });

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
  add({
    key: "noc-application",
    kind: null,
    label: "No Objection Certificate (NOC)",
    group: "visa",
    stage: "after-offer",
    requirement: "required",
    note: NOC_NOTE,
    source: { url: NOC_PRIMARY.source, lastVerified: NOC_PRIMARY.lastVerified },
  });
  add({ key: "coe", kind: "coe", label: "Confirmation of Enrolment (CoE)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["coe"]!.summary, source: reqSource("coe") });
  add({ key: "oshc", kind: "oshc", label: "Overseas Student Health Cover (OSHC)", group: "visa", stage: "after-offer", requirement: "required", note: VISA_REQ["oshc"]!.summary, source: reqSource("oshc") });
  add({
    key: "medical", kind: "medical", label: "Panel medical exam",
    group: "visa", stage: "after-offer", requirement: "required",
    note: MEDICAL_NOTE,
    source: { url: HEALTH_EXAM_SOURCE.source, lastVerified: HEALTH_EXAM_SOURCE.lastVerified },
  });
  add({
    key: "biometrics",
    kind: null,
    label: "Biometrics letter",
    group: "visa",
    stage: "after-offer",
    requirement: "required",
    note: BIOMETRICS_NOTE,
    // SOURCE-DISPLAY GUARD: the note carries three claims from two modules, but the
    // SourceLine shows one URL — point it at the most concrete/falsifiable claim, the
    // C.127 VFS Kathmandu fee/biometrics page, NOT A.031's Immi App page. A.031 stays
    // reconcile-backed via AU_BIOMETRICS (findingRefs), independent of the rendered URL.
    source: { url: BIOMETRICS_FEE.source, lastVerified: BIOMETRICS_FEE.lastVerified },
  });

  return items;
}
