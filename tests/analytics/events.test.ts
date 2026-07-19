import { describe, it, expect, expectTypeOf, vi, afterEach } from "vitest";
import posthog from "posthog-js";
import { track, identify, type AnalyticsEvents, type AnalyticsEventName } from "@/lib/analytics/events";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn(), init: vi.fn(), __loaded: false },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("track / identify no-op without a key (acceptance 1)", () => {
  it("never reaches posthog when NEXT_PUBLIC_POSTHOG_KEY is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    track("gate_cta_clicked");
    track("source_link_clicked", { surface: "checklist", domain: "immi.homeaffairs.gov.au" });
    identify("0b9fbc36-0000-0000-0000-000000000000");
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it("forwards event name + props to posthog.capture when the key is set", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    track("plan_action", { kind: "ielts-booking", action: "done" });
    track("signed_in");
    expect(posthog.capture).toHaveBeenCalledWith("plan_action", {
      kind: "ielts-booking",
      action: "done",
    });
    expect(posthog.capture).toHaveBeenCalledWith("signed_in", undefined);
  });

  it("identify sends the supabase uuid and nothing else", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    identify("0b9fbc36-0000-0000-0000-000000000000");
    expect(posthog.identify).toHaveBeenCalledWith("0b9fbc36-0000-0000-0000-000000000000");
  });
});

describe("catalog payload guardrails (acceptance 2 + 4)", () => {
  it("the catalog is exactly the nine wired events", () => {
    expectTypeOf<AnalyticsEventName>().toEqualTypeOf<
      | "wizard_step_viewed"
      | "wizard_completed"
      | "assessment_viewed"
      | "source_link_clicked"
      | "gate_cta_clicked"
      | "dashboard_cta_clicked"
      | "plan_action"
      | "checklist_plan_link_clicked"
      | "signed_in"
    >();
  });

  it("every payload field is a closed enum, boolean, or id string — no free text", () => {
    // Closed enums: the union members are pinned so a widening to `string` fails here.
    expectTypeOf<AnalyticsEvents["assessment_viewed"]["mode"]>().toEqualTypeOf<
      "anonymous" | "owned"
    >();
    expectTypeOf<AnalyticsEvents["assessment_viewed"]["band"]>().toEqualTypeOf<
      "strong" | "possible" | "reach"
    >();
    expectTypeOf<AnalyticsEvents["source_link_clicked"]["surface"]>().toEqualTypeOf<
      "factor-bars" | "refusal-recovery" | "cost-to-apply" | "cost-estimate" | "checklist" | "matches" | "genuine-student" | "working-with-agents" | "policy-banner" | "preference-note" | "plan"
    >();
    expectTypeOf<AnalyticsEvents["dashboard_cta_clicked"]["state"]>().toEqualTypeOf<
      "profile-incomplete" | "matches-need-inputs" | "next" | "waiting" | "caught-up"
    >();
    expectTypeOf<AnalyticsEvents["plan_action"]["action"]>().toEqualTypeOf<
      "done" | "dismissed" | "started" | "reopened"
    >();

    // The only plain-string fields are stable ids (spec: domain/key/kind/step).
    expectTypeOf<AnalyticsEvents["wizard_step_viewed"]>().toEqualTypeOf<{ step: string }>();
    expectTypeOf<AnalyticsEvents["source_link_clicked"]["domain"]>().toBeString();
    expectTypeOf<AnalyticsEvents["checklist_plan_link_clicked"]>().toEqualTypeOf<{
      key: string;
    }>();
    expectTypeOf<AnalyticsEvents["plan_action"]["kind"]>().toBeString();
    expectTypeOf<AnalyticsEvents["dashboard_cta_clicked"]["kind"]>().toEqualTypeOf<
      string | undefined
    >();

    // Prop-less events carry no payload at all.
    expectTypeOf<AnalyticsEvents["gate_cta_clicked"]>().toEqualTypeOf<undefined>();
    expectTypeOf<AnalyticsEvents["signed_in"]>().toEqualTypeOf<undefined>();
  });
});

// Compile-time rejections (never executed — typecheck is the test).
const rejectsAtCompileTime = () => {
  // @ts-expect-error unknown event names are rejected
  track("made_up_event");
  // @ts-expect-error unknown enum members are rejected
  track("plan_action", { kind: "ielts-booking", action: "deleted" });
  // @ts-expect-error extra/free-text props are rejected
  track("gate_cta_clicked", { note: "free text" });
  // @ts-expect-error missing props are rejected
  track("source_link_clicked");
};
void rejectsAtCompileTime;
