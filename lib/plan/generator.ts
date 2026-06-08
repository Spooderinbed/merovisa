import type { ProfileSections } from "@/lib/profiles/sections";
import type { MatchResult } from "@/lib/matches/types";
import type { PlanItem } from "./types";
import { AU_DHA_LIVING_CAPACITY_AUD } from "@/lib/data/policy/au-cost-of-living";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";
import { AU_FINANCIAL_EVIDENCE } from "@/lib/data/source/au-financial-evidence";
import { NEPAL_SOURCE_OF_FUNDS } from "@/lib/data/source/nepal-source-of-funds";
import { NEPAL_NOC_JOURNEY } from "@/lib/data/source/nepal-noc-journey";

export interface GeneratorInputs {
  sections: ProfileSections;
  primaryDestinationId: string | null;
  matches: MatchResult[];        // for "X more strong matches if you fix Y" hints
  policy: { nepalAssessmentLevel: "L2" | "L3" };
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

export function generatePlan(inputs: GeneratorInputs): PlanItem[] {
  const out: PlanItem[] = [];
  const s = inputs.sections;
  const hasPrimary = !!inputs.primaryDestinationId;
  const reachCount = inputs.matches.filter((m) => m.verdict === "reach").length;
  const possibleCount = inputs.matches.filter((m) => m.verdict === "possible").length;

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
      liftEstimate: possibleCount > 0 ? `Could re-classify ${possibleCount} possible matches as strong` : "Sharpens band-aware verdicts",
      timeEstimate: "2 minutes",
    });
  }

  if (!s.finance?.proofUploaded) {
    out.push({
      kind: "upload-proof-of-funds",
      impact: "high",
      title: "Add proof of funds",
      body: `DHA expects evidence covering AUD ${AU_DHA_LIVING_CAPACITY_AUD.value.toLocaleString()} living costs plus first-year tuition. It accepts ${oxfordOr(EVIDENCE_PATHS)}. A bank statement or loan sanction letter from a Class A institution is the usual proof.`,
      liftEstimate: "Single biggest lift for visa case strength",
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
      liftEstimate: "Prevents the most common refusal reason for Nepal AL3 applicants",
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
      body: `Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student requirement. You'll answer four questions — your current circumstances and ties, why this course and provider, how it benefits you, and anything else relevant — each in ${gs.responseLimitWords} words or less. Draft your answers early; they anchor your whole application.`,
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
