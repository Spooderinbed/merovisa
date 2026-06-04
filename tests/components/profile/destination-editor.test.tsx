import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DestinationEditor } from "@/components/profile/editors/destination-editor";

describe("DestinationEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<DestinationEditor initial={{ primary: "australia", alternates: ["canada", "uk"] }} />);
    expect(screen.getByLabelText(/Primary destination/i)).toHaveValue("australia");
    expect(screen.getByLabelText(/Alternates/i)).toHaveValue("canada, uk");
  });

  it("PATCHes /api/profile/section with section destination", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<DestinationEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Primary destination/i), "australia");
    await userEvent.type(screen.getByLabelText(/Alternates/i), "canada, uk");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profile/section",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.section).toBe("destination");
    expect(body.patch.primary).toBe("australia");
    expect(body.patch.alternates).toEqual(["canada", "uk"]);
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<DestinationEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Primary destination/i), "canada");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
