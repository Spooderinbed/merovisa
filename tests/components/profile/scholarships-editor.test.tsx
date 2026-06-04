import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScholarshipsEditor } from "@/components/profile/editors/scholarships-editor";

describe("ScholarshipsEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing tags joined by commas", () => {
    render(<ScholarshipsEditor initial={{ profile: ["merit", "minority"] }} />);
    expect(screen.getByLabelText(/Scholarship profile/i)).toHaveValue("merit, minority");
  });

  it("PATCHes with section scholarships and splits the tags", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<ScholarshipsEditor initial={{}} />);
    await userEvent.type(
      screen.getByLabelText(/Scholarship profile/i),
      "merit, minority, regional",
    );
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("scholarships");
    expect(body.patch.profile).toEqual(["merit", "minority", "regional"]);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
