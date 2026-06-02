import { describe, it, expect } from "vitest";
import {
  EDUCATION_LABELS,
  FIELD_LABELS,
  DESTINATION_LABELS,
  FUNDING_LABELS,
  GOAL_LABELS,
  GAP_REASON_LABELS,
} from "@/lib/labels";
import {
  EDUCATION_LEVELS,
  FIELDS_OF_STUDY,
  DESTINATIONS,
  FUNDING_SOURCES,
  GOALS,
  GAP_REASONS,
} from "@/lib/scoring/types";

describe("display labels", () => {
  it("covers every enum member", () => {
    expect(Object.keys(EDUCATION_LABELS).sort()).toEqual([...EDUCATION_LEVELS].sort());
    expect(Object.keys(FIELD_LABELS).sort()).toEqual([...FIELDS_OF_STUDY].sort());
    expect(Object.keys(DESTINATION_LABELS).sort()).toEqual([...DESTINATIONS].sort());
    expect(Object.keys(FUNDING_LABELS).sort()).toEqual([...FUNDING_SOURCES].sort());
    expect(Object.keys(GOAL_LABELS).sort()).toEqual([...GOALS].sort());
    expect(Object.keys(GAP_REASON_LABELS).sort()).toEqual([...GAP_REASONS].sort());
  });

  it("renders human-readable strings", () => {
    expect(EDUCATION_LABELS.bachelors).toBe("Bachelor's");
    expect(DESTINATION_LABELS.australia).toBe("Australia");
  });
});
