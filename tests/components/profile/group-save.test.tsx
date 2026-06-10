import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveFeedback, useGroupSave, type GroupSaveEntry } from "@/components/profile/editors/section-save";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function Harness({ entries }: { entries: GroupSaveEntry[] }) {
  const { status, saveSections } = useGroupSave();
  const [result, setResult] = useState("");
  return (
    <div>
      <button type="button" onClick={async () => setResult(String(await saveSections(entries)))}>
        Save
      </button>
      <SaveFeedback status={status} />
      <output data-testid="result">{result}</output>
    </div>
  );
}

describe("useGroupSave", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("PATCHes /api/profile/section once per entry and shows a single Saved notice", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(
      <Harness
        entries={[
          { section: "personal", patch: { name: "Aarav" } },
          { section: "family", patch: { situation: "spouse" } },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies[0]).toEqual({ section: "personal", patch: { name: "Aarav" } });
    expect(bodies[1]).toEqual({ section: "family", patch: { situation: "spouse" } });
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
    expect(screen.getByTestId("result")).toHaveTextContent("true");
  });

  it("refreshes server data exactly once after all PATCHes succeed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(
      <Harness
        entries={[
          { section: "work", patch: { title: "Engineer" } },
          { section: "gap", patch: { years: 1 } },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows one error notice and skips refresh when any PATCH fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response("err", { status: 422 }));
    render(
      <Harness
        entries={[
          { section: "personal", patch: { name: "Aarav" } },
          { section: "family", patch: { situation: "spouse" } },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("result")).toHaveTextContent("false");
  });

  it("shows the error notice when a request fails at the network level", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Harness entries={[{ section: "personal", patch: { name: "A" } }]} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("treats an all-clean save (no dirty sections) as success without calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<Harness entries={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides the saved notice again after a short delay", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<Harness entries={[{ section: "personal", patch: { name: "A" } }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText("Saved")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });
});
