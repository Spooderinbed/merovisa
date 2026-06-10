import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutYouEditor } from "@/components/profile/editors/about-you-editor";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const okFetch = () =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

const bodies = (fetchMock: ReturnType<typeof okFetch>) =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

describe("AboutYouEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("renders existing personal and family values in inputs", () => {
    render(
      <AboutYouEditor
        initial={{ personal: { name: "Aarav", age: 23 }, family: { situation: "spouse" } }}
      />,
    );
    expect(screen.getByLabelText(/Name/i)).toHaveValue("Aarav");
    expect(screen.getByLabelText(/Age/i)).toHaveValue(23);
    expect(screen.getByLabelText(/Family situation/i)).toHaveValue("spouse");
  });

  it("does not render the intake date — it moved to Destination & intake", () => {
    render(<AboutYouEditor initial={{ personal: { name: "Aarav", intakeIso: "2027-07-01" } }} />);
    expect(screen.queryByLabelText(/Intake/i)).toBeNull();
  });

  it("PATCHes only the dirty personal section and shows one Saved notice", async () => {
    const fetchMock = okFetch();
    render(
      <AboutYouEditor
        initial={{ personal: { name: "Aarav" }, family: { situation: "spouse" } }}
      />,
    );
    await userEvent.clear(screen.getByLabelText(/Name/i));
    await userEvent.type(screen.getByLabelText(/Name/i), "Aarav Sharma");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("personal");
    expect(body.patch).toEqual({ name: "Aarav Sharma" });
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
  });

  it("PATCHes only the dirty family section when just family changed", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{ personal: { name: "Aarav", age: 23 } }} />);
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "alone");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("family");
    expect(body.patch).toEqual({ situation: "alone" });
  });

  it("PATCHes both sections when both changed, still with one Saved notice", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Name/i), "Aarav");
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "spouse");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sectionsPatched = bodies(fetchMock).map((b) => b.section);
    expect(sectionsPatched).toEqual(["personal", "family"]);
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
  });

  it("skips the API entirely when nothing changed and still confirms", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{ personal: { name: "Aarav" } }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("does not re-PATCH a section already saved once the baseline advances", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Name/i), "Aarav");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Second save with no further edits: personal is clean again.
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes server data after a successful save so summary and ring update", async () => {
    okFetch();
    render(<AboutYouEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Name/i), "Aarav");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows an error notice when the API returns non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<AboutYouEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Name/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reveals a child-count input only for spouse-and-kids", async () => {
    render(<AboutYouEditor initial={{ family: { situation: "spouse" } }} />);
    expect(screen.queryByLabelText(/Number of children/i)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "spouse-and-kids");
    expect(screen.getByLabelText(/Number of children/i)).toBeInTheDocument();
  });

  it("PATCHes the default child count when spouse-and-kids is newly selected", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{ family: { situation: "spouse" } }} />);
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "spouse-and-kids");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("family");
    expect(body.patch.situation).toBe("spouse-and-kids");
    expect(body.patch.children).toBe(1);
  });

  it("PATCHes an edited child count", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{ family: { situation: "spouse-and-kids", children: 1 } }} />);
    fireEvent.change(screen.getByLabelText(/Number of children/i), { target: { value: "4" } });
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const [body] = bodies(fetchMock);
    expect(body.patch.children).toBe(4);
  });

  it("omits children from the patch when the situation has no kids", async () => {
    const fetchMock = okFetch();
    render(<AboutYouEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Family situation/i), "spouse");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const [body] = bodies(fetchMock);
    expect(body.patch.situation).toBe("spouse");
    expect(body.patch.children).toBeUndefined();
  });
});
