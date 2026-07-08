// lib/marketing/checklist-items.ts
import type { Sourced } from "./provenance";

export interface ChecklistItem extends Sourced {
  label: string;
  done: boolean;
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { kind: "sourced", label: "Academic transcript verified", source: "University", verified: "Jun 2026", done: true },
  { kind: "sourced", label: "IELTS 6.5 recorded", source: "Home Affairs", verified: "Jun 2026", done: true },
  { kind: "sourced", label: "Financial evidence: A$29,710", source: "Home Affairs", verified: "Jun 2026", done: false },
  { kind: "sourced", label: "Genuine Student (GS) statement drafted", source: "Home Affairs", verified: "Jun 2026", done: false },
  { kind: "sourced", label: "Confirmation of Enrolment (CoE)", source: "Provider", verified: "Jun 2026", done: false },
  { kind: "sourced", label: "OSHC health cover arranged", source: "Home Affairs", verified: "Jun 2026", done: false },
];
