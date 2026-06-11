import type { ProfileSections } from "@/lib/profiles/sections";
import type { MatchResult } from "@/lib/matches/types";
import type { PlanItem } from "./types";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";
import { AU_DOCUMENT_PREPARATION } from "@/lib/data/source/au-document-preparation";
import { AU_HEALTH_EXAM } from "@/lib/data/source/au-health-exam";
import { AU_HEALTH_BIOMETRIC_FACTS } from "@/lib/data/source/au-health-biometric-facts";
import { AU_BIOMETRICS } from "@/lib/data/source/au-biometrics";
import { AU_POLICE_CERTIFICATE } from "@/lib/data/source/au-police-certificate";
import { NEPAL_POLICE_CERTIFICATE } from "@/lib/data/source/nepal-police-certificate";
import { NEPAL_DOCUMENT_PROCESSING_TIMES } from "@/lib/data/source/nepal-document-processing-times";
import { NEPAL_PASSPORT_PROCESS } from "@/lib/data/source/nepal-passport-process";

export interface GeneratorInputs {
  sections: ProfileSections;
  primaryDestinationId: string | null;
  matches: MatchResult[];        // for "X more strong matches if you fix Y" hints
  policy: { nepalAssessmentLevel: "L2" | "L3" };
  hasPassport?: boolean;         // from the user's uploaded document kinds; gates start-passport-process. Omitted => not emitted.
}

const EVIDENCE_PATHS = AU_FINANCIAL_EVIDENCE.filter((e) => e.kind === "evidence-path").map((e) => e.summary);

/** Join phrases as "a, b, c, or d" (Oxford "or"). */
function oxfordOr(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1]!;
  return `${items.slice(0, -1).join(", ")}, or ${last}`;
}

/** Join phrases as "a, b, and c" (Oxford "and"). */
function oxfordAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  const last = items[items.length - 1]!;
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}

const SOF_REQUIREMENTS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "bank-requirement").map((r) => r.summary).join(" and ");
const SOF_MECHANISMS = NEPAL_SOURCE_OF_FUNDS.filter((r) => r.kind === "remittance-mechanism").map((r) => r.summary).join(" ");
const NOC_DOCS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "required-document").map((r) => r.summary);
const NOC_STEPS = NEPAL_NOC_JOURNEY.filter((r) => r.kind === "process-step").map((r) => r.summary).join(" ");
const CERTIFIED_COPIES = AU_DOCUMENT_PREPARATION.filter((r) => r.kind === "certified-copy").map((r) => r.summary);
const HEALTH_EXAM_PROCESS = AU_HEALTH_EXAM.filter((r) => r.kind === "process").map((r) => r.summary).join(" ");
const HEALTH_EXAM_VALIDITY = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "health-examination-validity")!; // C.092
const BIOMETRICS_LETTER = AU_BIOMETRICS.find((r) => r.id === "immi-app-biometrics-letter")!; // A.031
const BIOMETRICS_FEE = AU_HEALTH_BIOMETRIC_FACTS.find((r) => r.id === "vfs-kathmandu-biometric-collection-fee")!; // C.127
const POLICE_CERT = AU_POLICE_CERTIFICATE.find((r) => r.id === "police-certificate-requirement")!; // A.039
const POLICE_ROUTE = NEPAL_POLICE_CERTIFICATE.find((r) => r.id === "opcr-application-route")!.summary; // A.095/096/097
const POLICE_VALIDITY = NEPAL_POLICE_CERTIFICATE.find((r) => r.id === "opcr-validity")!.summary;       // A.102
const POLICE_STD_DAYS = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "police-character-standard")!.typicalBusinessDays; // A.098 (read-only)
const POLICE_URGENT_DAYS = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "police-character-urgent")!.typicalBusinessDays; // A.099 (read-only)
const PP_PRE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "pre-enrolment")!.summary;          // A.043
const PP_CENTRE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "choose-centre")!.summary;        // A.044
const PP_BARCODE = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "barcode-copy")!.summary;        // A.045
const PP_BIO = NEPAL_PASSPORT_PROCESS.find((r) => r.id === "enrolment-biometrics")!.summary;    // A.046
const PASSPORT_CENTRAL_DAYS = NEPAL_DOCUMENT_PROCESSING_TIMES.find((r) => r.id === "passport-central")!.typicalBusinessDays; // A.049 (read-only)

export function generatePlan(inputs: GeneratorInputs): PlanItem[] {
  const out: PlanItem[] = [];
  const s = inputs.sections;
  const hasPrimary = !!inputs.primaryDestinationId;
  const reachCount = inputs.matches.filter((m) => m.verdict === "reach").length;
  // Possible matches actually gated on per-band scores. The report can only verify
  // bands, never lift a verdict (min band ≤ overall), so the lift line claims a
  // check on the genuinely band-gated set — not re-classification (audit 2026-06-10).
  const bandGatedPossible = inputs.matches.filter(
    (m) => m.verdict === "possible" && m.scoreSnapshot.bandGap > 0,
  ).length;

  // PROFILE COMPLETENESS
  if (!s.personal?.name) {
    out.push({
      kind: "set-name",
      impact: "low",
      title: "Add your name",
      body: "Your dashboard greets you and confirmation letters reference it.",
      timeEstimate: "30 seconds",
    });
  }

  if (!s.academic?.gradePercent) {
    out.push({
      kind: "add-grade",
      impact: "high",
      title: "Add your academic grade",
      body: "We use your Nepal TU percentage to derive an Australian WAM band and compare against each program's minimum.",
      liftEstimate: "Required for any match scoring",
      timeEstimate: "1 minute",
    });
  }

  if (s.english?.overall == null) {
    out.push({
      kind: "add-english-score",
      impact: "high",
      title: "Add your IELTS overall score",
      body: "Programs publish minimums per band; without an overall we can't tell strong from reach.",
      liftEstimate: "Required for any match scoring",
      timeEstimate: "1 minute",
    });
  } else if (s.english.reportUploaded === false) {
    out.push({
      kind: "upload-ielts-report",
      impact: "medium",
      title: "Upload your IELTS report",
      body: "Uploading the official report lets us check per-band scores against program requirements (some nursing programs need each band ≥ 7).",
      liftEstimate:
        bandGatedPossible > 0
          ? `Verifies per-band requirements on ${bandGatedPossible} possible ${bandGatedPossible === 1 ? "match" : "matches"}`
          : "Sharpens band-aware verdicts",
      timeEstimate: "2 minutes",
    });
  }

  if (!s.finance?.proofUploaded) {
    out.push({
      kind: "upload-proof-of-funds",
      impact: "high",
      title: "Add proof of funds",
      body: `DHA expects evidence covering AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living costs plus first-year tuition. It accepts ${oxfordOr(EVIDENCE_PATHS)}. A bank statement or loan sanction letter from a Class A institution is the usual proof.`,
      liftEstimate: "Core financial evidence for your visa case",
      timeEstimate: "1-3 days",
    });
  }

  // NEPAL SOURCE OF FUNDS / REMITTANCE (NRB rules) — once a remittable funding source is declared
  if (s.finance?.source && s.finance.source !== "scholarship-dependent") {
    out.push({
      kind: "prepare-fund-remittance",
      impact: "medium",
      title: "Prepare to release your funds from Nepal",
      body: `Moving money abroad for study runs through Nepal Rastra Bank. Your bank requires ${SOF_REQUIREMENTS}. ${SOF_MECHANISMS}`,
      timeEstimate: "1-2 weeks",
    });
  }

  // STUDY GAP
  if (s.gap?.years && s.gap.years >= 1 && !(s.gap.reasons?.length)) {
    out.push({
      kind: "document-gap-reasons",
      impact: "medium",
      title: "Document your study gap reasons",
      body: "Genuine Student narrative needs a coherent explanation for any gap ≥ 1 year. Note what you did (work, family, prep) per year.",
      timeEstimate: "1 hour",
    });
  }
  if (s.gap?.years && s.gap.years >= 1 && !(s.gap.evidence?.length)) {
    out.push({
      kind: "document-gap-evidence",
      impact: "high",
      title: "Add evidence for your study gap",
      body: "Employment letter, salary slips, or other docs. Without evidence the GS test gets harder.",
      timeEstimate: "Hours to a few days",
    });
  }

  // POLICY (Nepal AL3)
  if (inputs.policy.nepalAssessmentLevel === "L3") {
    out.push({
      kind: "season-funds-six-months",
      impact: "high",
      title: "Season your bank statements for 6 months",
      body: "Nepal returned to Assessment Level 3 in Jan 2026. DHA case officers now expect 6 months of stable balance + source-of-funds documentation for any deposit > AUD 5,000.",
      // "Documented refusal ground" per nepal-refusal-recovery ground-capacity; no
      // sourced frequency ranking exists, so no "most common", and seasoning
      // addresses the ground rather than preventing refusal.
      liftEstimate: "Addresses a documented refusal ground — financial capacity",
      timeEstimate: "Plan ahead — 6 months elapsed",
    });
  }

  // GENUINE STUDENT (Australian student-visa requirement)
  if (inputs.primaryDestinationId === "australia") {
    const gs = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "genuine-student")!;
    out.push({
      kind: "prepare-gs-answers",
      impact: "high",
      title: "Prepare your Genuine Student answers",
      body: `Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement. You'll answer short questions in the visa form — your circumstances and ties, why this course and this provider, and how it benefits you — each in ${gs.responseLimitWords} words or less, in English. Answers backed by evidence carry more weight, and wanting permanent residence later doesn't count against you as long as your study plan and stay are genuine under the visa rules. Draft yours early; they anchor your whole application.`,
      timeEstimate: "2-4 hours",
    });
  }

  // NEPAL NOC APPLICATION JOURNEY (MoEST) — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "apply-for-noc",
      impact: "medium",
      title: "Apply for your NOC (No Objection Certificate)",
      body:
        `Once your offer arrives, apply for your No Objection Certificate (NOC) — the permit from ` +
        `Nepal's Ministry of Education that your bank needs before it can remit tuition. The MoEST portal asks for ${oxfordAnd(NOC_DOCS)}. ` +
        `${NOC_STEPS} It can take time, so start as soon as you're accepted.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // DHA DOCUMENT PREPARATION (translation + certified copies) — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "translate-certify-documents",
      impact: "medium",
      title: "Translate and certify your documents",
      body:
        `Translate any non-English document into English and keep both the original and translation. ` +
        `If your translator is outside Australia, include their details. ` +
        `DHA also asks for certified copies of some identity documents, including your ${oxfordAnd(CERTIFIED_COPIES)}.`,
      timeEstimate: "1 week",
    });
  }

  // DHA HEALTH EXAMINATION readiness — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "prepare-health-exam",
      impact: "medium",
      title: "Prepare for your health examination",
      body:
        `DHA may request a health examination as part of your visa. ${HEALTH_EXAM_PROCESS} ` +
        `Results are generally valid for ${HEALTH_EXAM_VALIDITY.value} ${HEALTH_EXAM_VALIDITY.unit}, so arrange it early — don't let it hold up your application.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // DHA BIOMETRICS readiness (after lodgement) — once Australia is the committed destination
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "prepare-biometrics",
      impact: "medium",
      title: "Prepare for biometrics after you lodge",
      body:
        // participation framed from C.123; fee from C.127; the AUI sentence is A.031 verbatim
        `Nepal is in Australia's biometrics program, so you'll give biometrics at a VFS Global centre as part of your visa ` +
        `(collection fee about ${BIOMETRICS_FEE.unit} ${Number(BIOMETRICS_FEE.value).toLocaleString()} in Kathmandu). ` +
        `${BIOMETRICS_LETTER.summary}`,
      timeEstimate: "After you lodge",
    });
  }

  // DHA POLICE / CHARACTER certificate (after lodgement) — once Australia is committed
  if (inputs.primaryDestinationId === "australia") {
    out.push({
      kind: "prepare-police-certificate",
      impact: "medium",
      title: "Get your police certificate",
      // opens with POLICE_CERT.summary verbatim (the A.039 rule), shared with the checklist
      // note; the plan then carries the OPCR how-to: route (A.095/096/097), turnaround
      // (A.098/099, read-only) and 3-month validity (A.102) + a timing nudge.
      body:
        `${POLICE_CERT.summary} For most Nepali students that means a Nepal Police character certificate, ` +
        `plus one from any other country you've lived in that long. ${POLICE_ROUTE} ` +
        `Standard service is usually about ${POLICE_STD_DAYS} working days (${POLICE_URGENT_DAYS} working day urgent). ` +
        `${POLICE_VALIDITY} Time it so it's still valid when you lodge.`,
      timeEstimate: "1-2 weeks",
    });
  }

  // PASSPORT (Nepal-side prerequisite) — destination-agnostic; show only if no passport uploaded.
  // Gate is strict === false: omitted (undefined) means do not emit (older/direct callers).
  if (inputs.hasPassport === false) {
    out.push({
      kind: "start-passport-process",
      impact: "medium",
      title: "Start your passport application",
      body:
        `Start with ${PP_PRE}, where you choose ${PP_CENTRE}. ` +
        `After submitting, you'll get ${PP_BARCODE}, then give ${PP_BIO}. ` +
        `Lodged at the central office, an ordinary e-passport is usually ready in about ${PASSPORT_CENTRAL_DAYS} working days.`,
    });
  }

  // WORK + CAREER
  if (s.work?.title && !s.work.docs) {
    out.push({
      kind: "add-work-docs",
      impact: "medium",
      title: "Get an employment letter on company letterhead",
      body: "Title, dates, salary, role description. Strengthens both admissions (for executive programs) and GS narrative.",
      timeEstimate: "1 week",
    });
  }

  // INTENDED STUDY
  if (!s["intended-study"]?.field) {
    out.push({
      kind: "set-intended-field",
      impact: "medium",
      title: "Set your intended field of study",
      body: "Programs are scored against the field you choose. Without it we surface everything indiscriminately.",
      timeEstimate: "1 minute",
    });
  }

  // SHORTLIST GUIDANCE
  if (hasPrimary && reachCount > 0 && inputs.matches.filter((m) => m.verdict === "strong").length === 0) {
    out.push({
      kind: "add-safer-options",
      impact: "medium",
      title: "Add safer university options",
      body: `Your current matches are all reach. Add 2–3 mid-tier programs (e.g. RMIT, UTS, Macquarie) to balance the application portfolio.`,
      timeEstimate: "1 hour",
    });
  }

  return out;
}
