import type { DocumentKind } from "./types";
import type { SectionKey } from "@/lib/profiles/sections";

interface ProfilePatch {
  section: SectionKey;
  patch: Record<string, unknown>;
}

type Mapper = (extracted: Record<string, unknown>) => Record<string, unknown>;

const MAPPINGS: Partial<Record<DocumentKind, { section: SectionKey; map: Mapper }>> = {
  passport: {
    section: "personal",
    map: (d) => {
      const patch: Record<string, unknown> = {};
      if (d.name) patch.name = d.name;
      if (d.dob) {
        const age = Math.floor(
          (Date.now() - new Date(d.dob as string).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
        );
        if (age >= 15 && age <= 80) patch.age = age;
      }
      return patch;
    },
  },
  ielts: {
    section: "english",
    map: (d) => ({
      test: "ielts", overall: d.overall,
      listening: d.listening, reading: d.reading, writing: d.writing, speaking: d.speaking,
      reportUploaded: true,
    }),
  },
  pte: {
    section: "english",
    map: (d) => ({
      test: "pte", overall: d.overall,
      listening: d.listening, reading: d.reading, writing: d.writing, speaking: d.speaking,
      reportUploaded: true,
    }),
  },
  toefl: {
    section: "english",
    map: (d) => ({
      test: "toefl", overall: d.overall,
      listening: d.listening, reading: d.reading, writing: d.writing, speaking: d.speaking,
      reportUploaded: true,
    }),
  },
  "bachelors-transcript": {
    section: "academic",
    map: (d) => {
      const patch: Record<string, unknown> = {};
      if (d.institution) patch.institution = d.institution;
      if (d.degree) patch.degree = d.degree;
      if (d.gradePercent != null) patch.gradePercent = d.gradePercent;
      return patch;
    },
  },
  "bank-statement": {
    section: "finance",
    map: (d) => {
      const patch: Record<string, unknown> = { proofUploaded: true };
      if (d.balance != null) patch.total = d.balance;
      if (d.currency) patch.currency = d.currency;
      return patch;
    },
  },
  "employment-letter": {
    section: "work",
    map: (d) => {
      const patch: Record<string, unknown> = { docs: true };
      if (d.title) patch.title = d.title;
      if (d.years != null) patch.years = d.years;
      return patch;
    },
  },
  "salary-slip": {
    section: "work",
    map: () => ({ docs: true }),
  },
  "offer-letter": {
    section: "intended-study",
    map: (d) => {
      const patch: Record<string, unknown> = {};
      if (d.program) patch.field = d.program;
      return patch;
    },
  },
};

export function mapToProfilePatch(kind: DocumentKind, extracted: Record<string, unknown>): ProfilePatch | null {
  const mapping = MAPPINGS[kind];
  if (!mapping) return null;
  const patch = mapping.map(extracted);
  if (Object.keys(patch).length === 0) return null;
  return { section: mapping.section, patch };
}
