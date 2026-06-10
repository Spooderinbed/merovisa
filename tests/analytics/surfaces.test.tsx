import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import posthog from "posthog-js";
import { SourceLine } from "@/components/results/source-line";
import { PlanItemCard } from "@/components/plan/plan-item-card";
import { PromptCard } from "@/components/dashboard/prompt-card";
import type { PlanItemRow } from "@/lib/plan/types";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn(), init: vi.fn(), __loaded: false },
}));

const planItem: PlanItemRow = {
  id: 1,
  owner: "user-1",
  kind: "book-ielts", // self-reported kind → the card renders its own Done button
  impact: "high",
  title: "Book your IELTS test",
  body: null,
  liftEstimate: null,
  timeEstimate: null,
  status: "todo",
  createdAt: "2026-06-10",
  completedAt: null,
  startedAt: null,
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("representative surfaces emit catalog events (acceptance 3)", () => {
  it("SourceLine click → source_link_clicked with surface + domain only", async () => {
    render(<SourceLine url="https://immi.homeaffairs.gov.au/visas/x?q=1" surface="checklist" />);
    await userEvent.click(screen.getByRole("link", { name: "immi.homeaffairs.gov.au" }));
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("source_link_clicked", {
      surface: "checklist",
      domain: "immi.homeaffairs.gov.au",
    });
  });

  it("plan card Done (API success) → plan_action with kind + action", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    render(<PlanItemCard item={planItem} />);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("plan_action", {
      kind: "book-ielts",
      action: "done",
    });
  });

  it("plan card action that fails at the API emits nothing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    render(<PlanItemCard item={planItem} />);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it("dashboard prompt CTA → dashboard_cta_clicked with state + plan kind", async () => {
    render(<PromptCard prompt={{ kind: "next", item: planItem }} />);
    await userEvent.click(screen.getByRole("link", { name: "Open your plan →" }));
    expect(posthog.capture).toHaveBeenCalledExactlyOnceWith("dashboard_cta_clicked", {
      state: "next",
      kind: "book-ielts",
    });
  });
});
