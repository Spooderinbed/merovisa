import { describe, it, expect } from "vitest";
import { profileSectionsFromAssessment } from "@/lib/profiles/from-assessment";

// F-1 claim-time symmetry: when the wizard collected a prior-refusal answer, the
// claimed profile's immigration section must reflect it. Otherwise a signed-in
// student sees "none" in the editor and a later edit would re-score with a penalty
// they never saw coming — the same punish-honesty surprise this slice removes.
describe("profileSectionsFromAssessment — immigration (F-1)", () => {
  it("maps a declared refusal into the immigration section", () => {
    const out = profileSectionsFromAssessment({ priorRefusals: "one" }, {});
    expect(out.immigration?.refusals).toBe("one");
  });

  it("maps an explicit 'none' too (the student's real answer, not an assumed default)", () => {
    const out = profileSectionsFromAssessment({ priorRefusals: "none" }, {});
    expect(out.immigration?.refusals).toBe("none");
  });

  it("omits the immigration section when no refusal answer is present", () => {
    const out = profileSectionsFromAssessment({}, {});
    expect(out.immigration).toBeUndefined();
  });
});
