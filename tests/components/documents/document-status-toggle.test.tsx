import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { DocumentStatusToggle } from "@/components/documents/document-status-toggle";

describe("DocumentStatusToggle", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.restoreAllMocks();
  });

  it("reflects the initial obtained state", () => {
    render(<DocumentStatusToggle kind="passport" label="Passport bio page" initialObtained />);
    const toggle = screen.getByRole("checkbox", { name: /passport bio page/i });
    expect(toggle).toBeChecked();
  });

  it("renders unobtained when initialObtained is false", () => {
    render(<DocumentStatusToggle kind="ielts" label="IELTS Scorecard" initialObtained={false} />);
    expect(screen.getByRole("checkbox", { name: /ielts scorecard/i })).not.toBeChecked();
  });

  it("optimistically flips and posts the kind + new state to /api/documents/status", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    render(<DocumentStatusToggle kind="passport" label="Passport bio page" initialObtained={false} />);
    const toggle = screen.getByRole("checkbox", { name: /passport bio page/i });
    await userEvent.click(toggle);

    expect(toggle).toBeChecked(); // optimistic
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("/api/documents/status");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ kind: "passport", obtained: true });
  });

  it("rolls back the optimistic flip when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 500 }),
    );

    render(<DocumentStatusToggle kind="passport" label="Passport bio page" initialObtained={false} />);
    const toggle = screen.getByRole("checkbox", { name: /passport bio page/i });
    await userEvent.click(toggle);

    expect(toggle).not.toBeChecked(); // rolled back
  });
});
