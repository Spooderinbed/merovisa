import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { OutcomeSelfReport } from "@/components/outcomes/outcome-self-report";

describe("OutcomeSelfReport", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("renders a button per legal next milestone, in human language", () => {
    render(<OutcomeSelfReport attemptId="att-1" nextEvents={["offer_received", "application_rejected"]} />);
    expect(screen.getByRole("button", { name: "I got an offer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I wasn't successful" })).toBeInTheDocument();
  });

  it("renders nothing when there is no legal next step", () => {
    const { container } = render(<OutcomeSelfReport attemptId="att-1" nextEvents={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("posts the chosen event to /api/outcomes/event and refreshes on success", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 }));

    render(<OutcomeSelfReport attemptId="att-7" nextEvents={["offer_received"]} />);
    await userEvent.click(screen.getByRole("button", { name: "I got an offer" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/outcomes/event");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.attemptId).toBe("att-7");
    expect(body.eventType).toBe("offer_received");
    expect(typeof body.occurredAt).toBe("string"); // the client stamps when it happened
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh and surfaces an error when the post fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 409 }));

    render(<OutcomeSelfReport attemptId="att-7" nextEvents={["offer_received"]} />);
    await userEvent.click(screen.getByRole("button", { name: "I got an offer" }));

    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn’t save|could not save|try again/i)).toBeInTheDocument();
  });

  it("never offers the silent root/withdrawn events even if handed them", () => {
    // 'applied'/'withdrawn' are valid EventTypes but carry no self-report label;
    // the control must filter them so no button renders (second guard after the server).
    render(<OutcomeSelfReport attemptId="att-1" nextEvents={["applied", "withdrawn"]} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
