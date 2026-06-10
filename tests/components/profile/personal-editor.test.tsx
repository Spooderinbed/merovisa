import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PersonalEditor } from "@/components/profile/editors/personal-editor";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("PersonalEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

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

  it("refreshes server data after a successful save so summary and ring update", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, completeness: 12 }), { status: 200 }),
    );
    render(<PersonalEditor initial={{ name: "Aarav" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("hides the saved notice again after a short delay", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<PersonalEditor initial={{ name: "Aarav" }} />);
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

  it("shows the error notice and skips refresh when the request fails at the network level", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<PersonalEditor initial={{ name: "Aarav" }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});
