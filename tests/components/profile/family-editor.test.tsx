import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FamilyEditor } from "@/components/profile/editors/family-editor";

describe("FamilyEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing value in select", () => {
    render(<FamilyEditor initial={{ situation: "spouse" }} />);
    expect(screen.getByLabelText(/Family situation/i)).toHaveValue("spouse");
  });

  it("PATCHes with section family", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<FamilyEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "spouse-and-kids");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.section).toBe("family");
    expect(body.patch.situation).toBe("spouse-and-kids");
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
