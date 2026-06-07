import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));

const { claimAssessment, upsertProfile, getProfile, from } = vi.hoisted(() => {
  const claimAssessment = vi.fn();
  const upsertProfile = vi.fn();
  const getProfile = vi.fn();
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ is: vi.fn().mockResolvedValue({ data: null, error: null }) }) });
  const select = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { profile_snapshot: { destination: "australia" } }, error: null }) }) });
  const from = vi.fn(() => ({ update, select }));
  return { claimAssessment, upsertProfile, getProfile, update, select, from };
});
const fakeAdmin = { from } as never;

vi.mock("@/lib/assessments/repo", () => ({ claimAssessment }));
vi.mock("@/lib/profiles/repo", () => ({ upsertProfile, getProfile }));

import { claimAndBootstrapProfile } from "@/lib/assessments/claim";

describe("claimAndBootstrapProfile", () => {
  beforeEach(() => {
    claimAssessment.mockReset();
    upsertProfile.mockReset();
    getProfile.mockReset();
    from.mockClear();
  });

  it("returns claimed:false when claimAssessment fails", async () => {
    claimAssessment.mockResolvedValue(false);
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out).toEqual({ claimed: false });
    expect(upsertProfile).not.toHaveBeenCalled();
  });

  it("bootstraps profile when claim succeeds and user has no profile", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue(null);
    upsertProfile.mockResolvedValue("p1");
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfile).toHaveBeenCalled();
    const call = upsertProfile.mock.calls[0]![1];
    expect(call.owner).toBe("u1");
    expect(call.sections.personal?.name).toBe("Aarav Sharma");
  });

  it("does not overwrite existing profile when claim succeeds", async () => {
    claimAssessment.mockResolvedValue(true);
    getProfile.mockResolvedValue({ id: "p1", owner: "u1", sections: { personal: { name: "Old" } }, completeness: 8 });
    const out = await claimAndBootstrapProfile(fakeAdmin, {
      assessmentId: "a1", userId: "u1", googleName: "Aarav Sharma",
    });
    expect(out.claimed).toBe(true);
    expect(upsertProfile).not.toHaveBeenCalled();
  });
});
