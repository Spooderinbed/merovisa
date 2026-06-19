import { describe, it, expect } from "vitest";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";

describe("AU_STUDENT_VISA_REQUIREMENTS citations", () => {
  it("cites the DHA Document Checklist Tool OSHC-timing finding (I.026) on the OSHC requirement", () => {
    // The OSHC copy already states the ≥1-week-before / full-duration rule; I.026
    // is the DHA web-evidentiary-tool corroboration of that timing. Pure-citation.
    const oshc = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "oshc");
    expect(oshc?.provenance.findingRefs).toContain("I.026");
  });
});
