// lib/marketing/plan-steps.ts
import type { StepState } from "./provenance";

export interface PlanStep {
  n: string;
  title: string;
  state: StepState;
  detail: string;
  cite: string;
  open?: boolean;
}

export const PLAN_STEPS: PlanStep[] = [
  { n: "01", title: "Confirm your eligibility", state: "Done", detail: "Your 9-question assessment placed you in the Possible band.", cite: "Status: completed" },
  { n: "02", title: "Shortlist programs that fit", state: "Now", detail: "We match your profile to programs you can realistically enter, ranked by fit, cost, and intake.", cite: "Source: University data · Jun 2026", open: true },
  { n: "03", title: "Sit IELTS or PTE", state: "Next", detail: "Target the band your shortlist needs: 6.5, with 7.0 opening more options.", cite: "Source: Home Affairs · Jun 2026" },
  { n: "04", title: "Prepare financial evidence", state: "Next", detail: "Evidence A$29,710 living costs plus one year's tuition, genuine and available.", cite: "Source: Home Affairs s.500 · Jun 2026" },
  { n: "05", title: "Lodge your student visa", state: "Later", detail: "Apply once your offer and CoE are in hand, with your Genuine Student (GS) statement documented.", cite: "Source: Home Affairs · Jun 2026" },
];
