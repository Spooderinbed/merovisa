import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CareerEditor } from "@/components/profile/editors/career-editor";

describe("CareerEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(
      <CareerEditor initial={{ goal: "permanent-residency", targetRole: "Software engineer" }} />,
    );
    expect(screen.getByLabelText(/Career goal/i)).toHaveValue("permanent-residency");
    expect(screen.getByLabelText(/Target role/i)).toHaveValue("Software engineer");
  });

  it("PATCHes with section career", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<CareerEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Career goal/i), "best-employment");
    await userEvent.type(screen.getByLabelText(/Target role/i), "Data analyst");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("career");
    expect(body.patch.goal).toBe("best-employment");
    expect(body.patch.targetRole).toBe("Data analyst");
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
