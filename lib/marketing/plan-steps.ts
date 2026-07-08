// lib/marketing/plan-steps.ts
import type { StepState, Sourced } from "./provenance";

/** A plan step's provenance: a sourced claim, or a lifecycle status (never sourced). */
type PlanCite = Sourced | { kind: "status"; label: string };

export interface PlanStep {
  n: string;
  title: string;
  state: StepState;
  detail: string;
  cite: PlanCite;
  open?: boolean;
}

export const PLAN_STEPS: PlanStep[] = [
  { n: "01", title: "Confirm your eligibility", state: "Done", detail: "Your 9-question assessment placed you in the Possible band.", cite: { kind: "status", label: "Status: completed" } },
  { n: "02", title: "Shortlist programs that fit", state: "Now", detail: "We match your profile to programs you can realistically enter, ranked by fit, cost, and intake.", cite: { kind: "sourced", source: "University data", verified: "Jun 2026" }, open: true },
  { n: "03", title: "Sit IELTS or PTE", state: "Next", detail: "Target the band your shortlist needs: 6.5, with 7.0 opening more options.", cite: { kind: "sourced", source: "Home Affairs", verified: "Jun 2026" } },
  { n: "04", title: "Prepare financial evidence", state: "Next", detail: "Evidence A$29,710 living costs plus one year's tuition, genuine and available.", cite: { kind: "sourced", source: "Home Affairs s.500", verified: "Jun 2026" } },
  { n: "05", title: "Lodge your student visa", state: "Later", detail: "Apply once your offer and CoE are in hand, with your Genuine Student (GS) statement documented.", cite: { kind: "sourced", source: "Home Affairs", verified: "Jun 2026" } },
];
