import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalEditor } from "@/components/profile/editors/personal-editor";

describe("PersonalEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<PersonalEditor initial={{ name: "Aarav", age: 23, intakeIso: "2027-07-01" }} />);
    expect(screen.getByLabelText(/Name/i)).toHaveValue("Aarav");
    expect(screen.getByLabelText(/Age/i)).toHaveValue(23);
    expect(screen.getByLabelText(/Intake/i)).toHaveValue("2027-07-01");
  });

  it("PATCHes /api/profile/section on save and shows a success notice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, completeness: 12 }), { status: 200 }),
    );
    render(<PersonalEditor initial={{ name: "Aarav" }} />);
    await userEvent.clear(screen.getByLabelText(/Name/i));
    await userEvent.type(screen.getByLabelText(/Name/i), "Aarav Sharma");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/section",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice when the API returns non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<PersonalEditor initial={{ name: "" }} />);
    await userEvent.type(screen.getByLabelText(/Name/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
