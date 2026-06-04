import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkEditor } from "@/components/profile/editors/work-editor";

describe("WorkEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<WorkEditor initial={{ title: "Engineer", years: 3, relevance: "related", docs: true }} />);
    expect(screen.getByLabelText(/Title/i)).toHaveValue("Engineer");
    expect(screen.getByLabelText(/Years/i)).toHaveValue(3);
    expect(screen.getByLabelText(/Relevance/i)).toHaveValue("related");
    expect(screen.getByLabelText(/Reference letter/i)).toBeChecked();
  });

  it("PATCHes with section work", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<WorkEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Title/i), "Junior Developer");
    await userEvent.type(screen.getByLabelText(/Years/i), "2");
    await userEvent.selectOptions(screen.getByLabelText(/Relevance/i), "directly-related");
    await userEvent.click(screen.getByLabelText(/Reference letter/i));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("work");
    expect(body.patch.title).toBe("Junior Developer");
    expect(body.patch.years).toBe(2);
    expect(body.patch.relevance).toBe("directly-related");
    expect(body.patch.docs).toBe(true);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<WorkEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Title/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
