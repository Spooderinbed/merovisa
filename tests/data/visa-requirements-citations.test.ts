import { describe, it, expect } from "vitest";
import { AU_STUDENT_VISA_REQUIREMENTS } from "@/lib/data/source/au-student-visa-requirements";

describe("AU_STUDENT_VISA_REQUIREMENTS citations", () => {
  it("cites the DHA Document Checklist Tool OSHC-timing finding (I.026) on the OSHC requirement", () => {
    // The OSHC copy already states the ≥1-week-before / full-duration rule; I.026
    // is the DHA web-evidentiary-tool corroboration of that timing. Pure-citation.
    const oshc = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "oshc");
    expect(oshc?.provenance.findingRefs).toContain("I.026");
  });

  it("registers the English-evidence requirement citing the approved-test-or-exemption finding (I.025)", () => {
    // New visa pillar surfacing I.025: an applicant must provide an approved English
    // test score OR evidence of an exemption. The registered findingRefs ["I.025"] is
    // what flips the finding to used; the inline checklist English item surfaces the copy.
    const english = AU_STUDENT_VISA_REQUIREMENTS.find((r) => r.id === "english");
    expect(english?.provenance.findingRefs).toContain("I.025");
    expect(english?.summary).toBe(
      "Required for the visa. Provide evidence of an approved English test score, or evidence that you qualify for an exemption.",
    );
  });
});
