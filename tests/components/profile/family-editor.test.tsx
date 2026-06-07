import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("family");
    expect(body.patch.situation).toBe("spouse-and-kids");
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("reveals a child-count input only for spouse-and-kids", async () => {
    render(<FamilyEditor initial={{ situation: "spouse" }} />);
    expect(screen.queryByLabelText(/Number of children/i)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "spouse-and-kids");
    expect(screen.getByLabelText(/Number of children/i)).toBeInTheDocument();
  });

  it("PATCHes the initial child count for spouse-and-kids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<FamilyEditor initial={{ situation: "spouse-and-kids", children: 3 }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.patch.situation).toBe("spouse-and-kids");
    expect(body.patch.children).toBe(3);
    fetchMock.mockRestore();
  });

  it("PATCHes an edited child count", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<FamilyEditor initial={{ situation: "spouse-and-kids", children: 1 }} />);
    fireEvent.change(screen.getByLabelText(/Number of children/i), { target: { value: "4" } });
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.patch.children).toBe(4);
    fetchMock.mockRestore();
  });

  it("omits children from the patch when the situation has no kids", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<FamilyEditor initial={{ situation: "spouse" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.patch.situation).toBe("spouse");
    expect(body.patch.children).toBeUndefined();
    fetchMock.mockRestore();
  });
});
