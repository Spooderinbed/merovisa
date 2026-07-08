// lib/marketing/sample-profiles.ts
import type { Sample, Tone, VerdictWord, DimTag } from "./provenance";

export interface Dimension {
  key: "academic" | "english" | "finances" | "visa";
  name: string;
  tag: DimTag;
  tone: Tone;
  width: number;
  blurb: string;
}

export interface SampleProfile extends Sample {
  id: "aarav" | "shruti";
  label: string;
  verdict: VerdictWord;
  tone: Tone;
  note: string;
  cost: number;
  dims: Dimension[];
}

export const formatCost = (n: number): string => `≈ A$${n.toLocaleString("en-US")}`;

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    kind: "sample",
    id: "aarav",
    label: "Aarav · GPA 3.2",
    verdict: "Possible",
    tone: "possible",
    note: "A realistic path, with two things to strengthen before you apply.",
    cost: 42600,
    dims: [
      { key: "academic", name: "Academic", tag: "Strong", tone: "strong", width: 82, blurb: "Your GPA maps to a competitive band for your target programs." },
      { key: "english", name: "English", tag: "Possible", tone: "possible", width: 58, blurb: "IELTS 6.5 meets the minimum; 7.0 would widen your options." },
      { key: "finances", name: "Finances", tag: "Possible", tone: "possible", width: 64, blurb: "Shown funds against the A$29,710 living requirement plus tuition." },
      { key: "visa", name: "Visa risk", tag: "Watch", tone: "reach", width: 41, blurb: "Your profile has watch-points across the Genuine Student (GS) factors an officer weighs." },
    ],
  },
  {
    kind: "sample",
    id: "shruti",
    label: "Shruti · GPA 3.8",
    verdict: "Strong",
    tone: "strong",
    note: "A strong position across the board. You can apply with confidence.",
    cost: 44200,
    dims: [
      { key: "academic", name: "Academic", tag: "Strong", tone: "strong", width: 91, blurb: "A high GPA places you above typical entry for these programs." },
      { key: "english", name: "English", tag: "Strong", tone: "strong", width: 88, blurb: "IELTS 7.5 clears every program on your shortlist." },
      { key: "finances", name: "Finances", tag: "Strong", tone: "strong", width: 79, blurb: "Shown funds comfortably cover living costs plus tuition." },
      { key: "visa", name: "Visa risk", tag: "Possible", tone: "possible", width: 62, blurb: "Genuine Student (GS) factors are solid; keep your study intent well documented." },
    ],
  },
];

export function getProfile(id: SampleProfile["id"]): SampleProfile {
  return SAMPLE_PROFILES.find((p) => p.id === id) ?? SAMPLE_PROFILES[0]!;
}
