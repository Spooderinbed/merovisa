import type { SectionStatus } from "@/lib/profiles/completeness";
import type { ProfileSections, SectionKey } from "@/lib/profiles/sections";
import type { Destination } from "@/lib/scoring/types";
import { humanize } from "@/lib/text/humanize";

/**
 * Presentation-level grouping of the 13 storage sections into the 8
 * user-approved editor rows (fix order #10). Storage keys, completeness
 * math, and the section schemas are untouched — a group is purely how the
 * profile page presents one or more storage sections.
 */
export interface ProfileGroup {
  key: string;
  title: string;
  sections: readonly SectionKey[];
}

export const PROFILE_GROUPS = [
  { key: "about-you",          title: "About you",            sections: ["personal", "family"] },
  { key: "destination-intake", title: "Destination & intake", sections: ["destination", "deal-breakers"] },
  { key: "academic",           title: "Academic background",  sections: ["academic"] },
  { key: "study-career",       title: "Study & career goals", sections: ["intended-study", "career"] },
  { key: "english",            title: "English proficiency",  sections: ["english"] },
  { key: "work-gap",           title: "Work & study gap",     sections: ["work", "gap"] },
  { key: "money-scholarships", title: "Money & scholarships", sections: ["finance", "scholarships"] },
  { key: "visa-history",       title: "Visa history",         sections: ["immigration"] },
] as const satisfies readonly ProfileGroup[];

export type ProfileGroupKey = (typeof PROFILE_GROUPS)[number]["key"];

/**
 * Read-time shim for legacy destination rows: the old editor wrote "us"
 * where scoring uses "usa". Saves always write scoring ids, so rows
 * self-heal on their next save. No bulk migration.
 */
export function normalizeStoredDestination(value: string): Destination {
  return (value === "us" ? "usa" : value) as Destination;
}

/**
 * Group row status over the member sections' existing per-section
 * completeness: all complete → complete; any progress → partial;
 * otherwise not started. The completeness ring keeps its own math.
 */
export function deriveGroupStatus(
  members: readonly SectionKey[],
  status: Record<SectionKey, SectionStatus>,
): SectionStatus {
  const statuses = members.map((k) => status[k]);
  if (statuses.every((s) => s === "complete")) return "complete";
  if (statuses.some((s) => s !== "empty")) return "partial";
  return "empty";
}

function summarize(key: SectionKey, sections: ProfileSections): string {
  const s = (sections as Record<string, Record<string, unknown> | undefined>)[key];
  if (!s) return "";
  switch (key) {
    case "personal":      return [s.name as string, s.age ? `${s.age}` : ""].filter(Boolean).join(" · ");
    case "destination":   return [humanize(normalizeStoredDestination(s.primary as string)), ...((s.alternates as string[] | undefined) ?? []).map((a) => humanize(normalizeStoredDestination(a)))].filter(Boolean).join(", ");
    case "academic":      return [s.institution as string, s.gradePercent ? `${s.gradePercent}%` : "", humanize(s.degree as string)].filter(Boolean).join(" · ");
    case "intended-study":return [humanize(s.level as string), humanize(s.field as string), s.specialisation as string].filter(Boolean).join(" · ");
    case "english":       return s.overall ? `IELTS ${s.overall} — ${s.reportUploaded ? "uploaded" : "report not uploaded"}` : "";
    case "gap":           return [s.years ? `${s.years} year` : "", ...((s.reasons as string[] | undefined) ?? []).map(humanize)].filter(Boolean).join(" · ");
    case "work":          return [s.title as string, s.years ? `${s.years} yr` : "", s.docs ? "" : "docs missing"].filter(Boolean).join(" · ");
    case "finance":       return [humanize(s.source as string), s.proofUploaded ? "" : "proof not uploaded"].filter(Boolean).join(" · ");
    case "immigration":   return [s.refusals ? `${humanize(s.refusals as string)} refusal${s.refusals !== "one" ? "s" : ""}` : "", s.travelled === undefined ? "travel history unknown" : ""].filter(Boolean).join(" · ");
    case "family":        return humanize(s.situation as string);
    case "career":        return [humanize(s.goal as string), ...((s.secondaryGoals as string[] | undefined) ?? []).map(humanize), s.targetRole as string].filter(Boolean).join(" · ");
    case "scholarships":  return ((s.profile as string[] | undefined) ?? []).join(", ");
    case "deal-breakers": return ((s.mustHaves as string[] | undefined) ?? []).join(", ");
  }
}

/**
 * Row summary for a group: the existing per-section summaries of its
 * members joined with " · ", skipping empties. The intake date renders
 * (and summarizes) under Destination & intake even though it stays
 * stored on personal.intakeIso.
 */
export function summarizeGroup(group: ProfileGroup, sections: ProfileSections): string {
  const parts = group.sections.map((k) => summarize(k, sections));
  if (group.key === "destination-intake") {
    const intake = sections.personal?.intakeIso;
    parts.splice(1, 0, intake ? `${intake} intake` : "");
  }
  return parts.filter(Boolean).join(" · ");
}
