import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImmigrationEditor } from "@/components/profile/editors/immigration-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("ImmigrationEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<ImmigrationEditor initial={{ refusals: "one", travelled: true }} />);
    expect(screen.getByLabelText(/Prior visa refusals/i)).toHaveValue("one");
    expect(screen.getByLabelText(/travelled abroad/i)).toBeChecked();
  });

  it("PATCHes with section immigration", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<ImmigrationEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Prior visa refusals/i), "none");
    await userEvent.click(screen.getByLabelText(/travelled abroad/i));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("immigration");
    expect(body.patch.refusals).toBe("none");
    expect(body.patch.travelled).toBe(true);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });
});
