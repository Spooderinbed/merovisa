import { SECTION_KEYS, REQUIRED_FIELDS, type SectionKey, type ProfileSections } from "./sections";

export type SectionStatus = "complete" | "partial" | "empty";

export interface CompletenessResult {
  pct: number;
  status: Record<SectionKey, SectionStatus>;
}

export function computeCompleteness(sections: ProfileSections): CompletenessResult {
  const status = {} as Record<SectionKey, SectionStatus>;
  let sum = 0;

  for (const key of SECTION_KEYS) {
    const data = (sections as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
    const required = REQUIRED_FIELDS[key];
    let s: SectionStatus;
    if (!data || Object.keys(data).length === 0) {
      s = "empty";
    } else if (required.length === 0) {
      s = "complete";
    } else {
      const filled = required.filter((f) => {
        const v = data[f];
        return v !== undefined && v !== null && v !== "";
      });
      s = filled.length === required.length ? "complete" : filled.length > 0 ? "partial" : "empty";
    }
    status[key] = s;
    sum += s === "complete" ? 1 : s === "partial" ? 0.5 : 0;
  }

  const pct = Math.round((sum / SECTION_KEYS.length) * 100);
  return { pct, status };
}
