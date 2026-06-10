import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DestinationIntakeEditor } from "@/components/profile/editors/destination-intake-editor";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const okFetch = () =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

const bodies = (fetchMock: ReturnType<typeof okFetch>) =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

describe("DestinationIntakeEditor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refresh.mockClear();
  });

  it("renders stored primary, alternates, intake, and must-haves", () => {
    render(
      <DestinationIntakeEditor
        initial={{
          destination: { primary: "australia", alternates: ["canada"] },
          personal: { intakeIso: "2027-07-01" },
          "deal-breakers": { mustHaves: ["pr-friendly"] },
        }}
      />,
    );
    expect(screen.getByRole("radio", { name: /Australia/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Canada/i })).toBeChecked();
    expect(screen.getByLabelText(/Intake/i)).toHaveValue("2027-07-01");
    expect(screen.getByRole("button", { name: /Remove pr-friendly/i })).toBeInTheDocument();
  });

  it("offers only supported destinations + not-sure as selectable; the rest say Coming soon", () => {
    render(<DestinationIntakeEditor initial={{}} />);
    expect(screen.getByRole("radio", { name: /Australia/i })).toBeEnabled();
    expect(screen.getByRole("radio", { name: /Not sure yet/i })).toBeEnabled();
    for (const country of ["Canada", "United Kingdom", "Germany", "United States", "Ireland"]) {
      expect(screen.getByRole("radio", { name: new RegExp(country, "i") })).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: new RegExp(country, "i") })).toBeDisabled();
    }
    // 5 unsupported countries in primary + the same 5 in alternates
    expect(screen.getAllByText("Coming soon")).toHaveLength(10);
  });

  it("loads a legacy stored \"us\" primary as usa (United States selected)", () => {
    render(<DestinationIntakeEditor initial={{ destination: { primary: "us" } }} />);
    expect(screen.getByRole("radio", { name: /United States/i })).toBeChecked();
  });

  it("self-heals a legacy \"us\" row: saving writes the scoring id usa", async () => {
    const fetchMock = okFetch();
    render(<DestinationIntakeEditor initial={{ destination: { primary: "us", alternates: ["us"] } }} />);
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("destination");
    expect(body.patch.primary).toBe("usa");
    expect(body.patch.alternates).toEqual(["usa"]);
  });

  it("PATCHes section destination with scoring ids when the choice changes", async () => {
    const fetchMock = okFetch();
    render(<DestinationIntakeEditor initial={{}} />);
    await userEvent.click(screen.getByRole("radio", { name: /Australia/i }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Australia/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("destination");
    expect(body.patch.primary).toBe("australia");
    expect(body.patch.alternates).toEqual(["australia"]);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("keeps stored unsupported alternates in the payload instead of dropping them", async () => {
    const fetchMock = okFetch();
    render(
      <DestinationIntakeEditor
        initial={{ destination: { primary: "not-sure", alternates: ["canada", "uk"] } }}
      />,
    );
    await userEvent.click(screen.getByRole("radio", { name: /Australia/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const [body] = bodies(fetchMock);
    expect(body.patch.primary).toBe("australia");
    expect(body.patch.alternates).toEqual(["canada", "uk"]);
  });

  it("persists an intake edit to personal.intakeIso — and only PATCHes personal", async () => {
    const fetchMock = okFetch();
    render(
      <DestinationIntakeEditor
        initial={{ destination: { primary: "australia" }, personal: { intakeIso: "" } }}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Intake/i), { target: { value: "2027-02-01" } });
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("personal");
    expect(body.patch).toEqual({ intakeIso: "2027-02-01" });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("round-trips must-haves chips: add and remove, then saves string[]", async () => {
    const fetchMock = okFetch();
    render(
      <DestinationIntakeEditor
        initial={{ "deal-breakers": { mustHaves: ["pr-friendly"] } }}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Must-haves/i), "work rights{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Remove pr-friendly/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("deal-breakers");
    expect(body.patch.mustHaves).toEqual(["work rights"]);
  });

  it("PATCHes each dirty section when several changed, with one Saved notice", async () => {
    const fetchMock = okFetch();
    render(<DestinationIntakeEditor initial={{}} />);
    await userEvent.click(screen.getByRole("radio", { name: /Not sure yet/i }));
    fireEvent.change(screen.getByLabelText(/Intake/i), { target: { value: "2027-07-01" } });
    await userEvent.type(screen.getByLabelText(/Must-haves/i), "affordable{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodies(fetchMock).map((b) => b.section)).toEqual([
      "destination",
      "personal",
      "deal-breakers",
    ]);
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<DestinationIntakeEditor initial={{}} />);
    await userEvent.click(screen.getByRole("radio", { name: /Australia/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
