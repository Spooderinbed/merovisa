import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntendedStudyEditor } from "@/components/profile/editors/intended-study-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("IntendedStudyEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<IntendedStudyEditor initial={{ level: "masters", field: "computer-science", specialisation: "AI" }} />);
    expect(screen.getByLabelText(/Level/i)).toHaveValue("masters");
    expect(screen.getByLabelText(/Field/i)).toHaveValue("computer-science");
    expect(screen.getByLabelText(/Specialisation/i)).toHaveValue("AI");
  });

  it("PATCHes with section intended-study", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<IntendedStudyEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Level/i), "masters");
    await userEvent.selectOptions(screen.getByLabelText(/Field/i), "data-science");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("intended-study");
    expect(body.patch.level).toBe("masters");
    expect(body.patch.field).toBe("data-science");
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<IntendedStudyEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Field/i), "other");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
