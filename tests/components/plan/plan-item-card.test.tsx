import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanItemCard } from "@/components/plan/plan-item-card";
import type { PlanItemRow } from "@/lib/plan/types";

const item: PlanItemRow = {
  id: 1,
  owner: "u1",
  kind: "k",
  impact: "high",
  title: "Upload IELTS",
  body: "Body",
  liftEstimate: "Unlocks 3 matches",
  timeEstimate: "2 minutes",
  status: "todo",
  createdAt: "2026-06-04",
  completedAt: null,
  startedAt: null,
};

describe("PlanItemCard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders title, body, lift + time estimates, and impact pill", () => {
    render(<PlanItemCard item={item} />);
    expect(screen.getByText("Upload IELTS")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText(/Unlocks 3 matches/)).toBeInTheDocument();
    expect(screen.getByText(/2 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/High impact/i)).toBeInTheDocument();
  });

  it("renders a source line under a figure-bearing item", () => {
    render(<PlanItemCard item={{ ...item, kind: "upload-proof-of-funds" }} />);
    expect(screen.getByRole("link", { name: /immi\.homeaffairs\.gov\.au/i })).toBeInTheDocument();
    expect(screen.getByText(/verified 2026-06-07/i)).toBeInTheDocument();
  });

  it("renders no source line for an item with no sourced figure", () => {
    render(<PlanItemCard item={item} />); // kind "k"
    expect(screen.queryByText(/^verified /i)).toBeNull();
  });

  it("renders no source line for the seasoning recommendation (not a published figure)", () => {
    render(<PlanItemCard item={{ ...item, kind: "season-funds-six-months" }} />);
    expect(screen.queryByText(/^verified /i)).toBeNull();
  });

  it("POSTs status=done on Done click", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<PlanItemCard item={item} />);
    await userEvent.click(screen.getByRole("button", { name: /Done/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/plan/action",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ id: 1, status: "done" });
  });

  it("shows Undo when item starts as done", () => {
    render(<PlanItemCard item={{ ...item, status: "done" }} />);
    expect(screen.getByRole("button", { name: /Undo/i })).toBeInTheDocument();
  });

  it("verified item: no Done button, CTA to the completing surface, Dismiss kept", () => {
    render(<PlanItemCard item={{ ...item, kind: "upload-ielts-report" }} />);
    expect(screen.queryByRole("button", { name: /^Done$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Mark as in progress/i })).toBeNull();
    expect(screen.getByRole("link", { name: /Upload in documents/i })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(screen.getByRole("button", { name: /Dismiss/i })).toBeInTheDocument();
  });

  it("self-reported item: POSTs started=true on 'Mark as in progress' and shows the badge", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<PlanItemCard item={{ ...item, kind: "apply-for-noc" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Mark as in progress/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ id: 1, started: true });
    expect(screen.getByText(/^In progress$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to open/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Done$/i })).toBeInTheDocument();
  });

  it("renders an already-started item with the badge and undo", () => {
    render(
      <PlanItemCard
        item={{ ...item, kind: "apply-for-noc", startedAt: "2026-06-10T00:00:00Z" }}
      />,
    );
    expect(screen.getByText(/^In progress$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to open/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mark as in progress/i })).toBeNull();
  });

  // Done vs Dismissed need to read differently in the Closed section (audit fix #4):
  // done = completed (chip + struck title), dismissed = opted out (chip, no strike).
  it("done item: shows a Done chip and strikes the title", () => {
    render(<PlanItemCard item={{ ...item, status: "done" }} />);
    const chip = screen.getByText(/^Done$/);
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("font-mono", "uppercase");
    expect(screen.getByText("Upload IELTS")).toHaveClass("line-through");
    expect(screen.queryByText(/^Dismissed$/)).toBeNull();
  });

  it("dismissed item: shows a Dismissed chip, no strikethrough, Undo kept", () => {
    render(<PlanItemCard item={{ ...item, status: "dismissed" }} />);
    const chip = screen.getByText(/^Dismissed$/);
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveClass("font-mono", "uppercase");
    expect(screen.getByText("Upload IELTS")).not.toHaveClass("line-through");
    expect(screen.queryByText(/^Done$/)).toBeNull();
    expect(screen.getByRole("button", { name: /Undo/i })).toBeInTheDocument();
  });

  it("dismissing an open item swaps in the Dismissed chip without striking the title", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<PlanItemCard item={item} />);
    await userEvent.click(screen.getByRole("button", { name: /Dismiss/i }));
    expect(screen.getByText(/^Dismissed$/)).toBeInTheDocument();
    expect(screen.getByText("Upload IELTS")).not.toHaveClass("line-through");
  });
});
