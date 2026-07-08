// lib/marketing/checklist-items.ts

export interface ChecklistItem {
  label: string;
  source: string;
  done: boolean;
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { label: "Academic transcript verified", source: "University · Jun 2026", done: true },
  { label: "IELTS 6.5 recorded", source: "Home Affairs · Jun 2026", done: true },
  { label: "Financial evidence: A$29,710", source: "Home Affairs · Jun 2026", done: false },
  { label: "Genuine Student (GS) statement drafted", source: "Home Affairs · Jun 2026", done: false },
  { label: "Confirmation of Enrolment (CoE)", source: "Provider · Jun 2026", done: false },
  { label: "OSHC health cover arranged", source: "Home Affairs · Jun 2026", done: false },
];
