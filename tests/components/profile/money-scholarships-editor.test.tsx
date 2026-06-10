import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoneyScholarshipsEditor } from "@/components/profile/editors/money-scholarships-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const okFetch = () =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

const bodies = (fetchMock: ReturnType<typeof okFetch>) =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

describe("MoneyScholarshipsEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing finance values and scholarship tags", () => {
    render(
      <MoneyScholarshipsEditor
        initial={{
          finance: { total: 5000000, currency: "NPR", source: "parents-family", proofUploaded: true },
          scholarships: { profile: ["merit", "minority"] },
        }}
      />,
    );
    expect(screen.getByLabelText(/Total funds available/i)).toHaveValue(5000000);
    expect(screen.getByLabelText(/Currency/i)).toHaveValue("NPR");
    expect(screen.getByLabelText(/Source of funds/i)).toHaveValue("parents-family");
    expect(screen.getByRole("button", { name: /Remove merit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove minority/i })).toBeInTheDocument();
  });

  it("shows Documents page hint", () => {
    render(<MoneyScholarshipsEditor initial={{}} />);
    const link = screen.getByRole("link", { name: /Documents page/i });
    expect(link).toHaveAttribute("href", "/documents");
  });

  it("names the DHA-accepted funding paths with a source link", () => {
    render(<MoneyScholarshipsEditor initial={{}} />);
    const link = screen.getByRole("link", { name: /DHA student visa page/i });
    expect(link.getAttribute("href")).toContain("student-500");
    const p = link.closest("p")!;
    expect(p.textContent).toContain("DHA accepts");
    expect(p.textContent).toContain("money deposit");
    expect(p.textContent).toContain("education loan");
    expect(p.textContent).toContain("scholarship or sponsorship");
    expect(p.textContent).toContain("parent or partner income");
  });

  it("PATCHes only finance when just finance fields changed", async () => {
    const fetchMock = okFetch();
    render(<MoneyScholarshipsEditor initial={{ scholarships: { profile: ["merit"] } }} />);
    await userEvent.type(screen.getByLabelText(/Total funds available/i), "2500000");
    await userEvent.selectOptions(screen.getByLabelText(/Currency/i), "AUD");
    await userEvent.selectOptions(screen.getByLabelText(/Source of funds/i), "education-loan");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("finance");
    expect(body.patch.total).toBe(2500000);
    expect(body.patch.currency).toBe("AUD");
    expect(body.patch.source).toBe("education-loan");
    expect(body.patch.proofUploaded).toBeUndefined();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("PATCHes only scholarships with chip tags as string[]", async () => {
    const fetchMock = okFetch();
    render(<MoneyScholarshipsEditor initial={{ finance: { total: 100, currency: "NPR" } }} />);
    const chips = screen.getByLabelText(/Scholarship profile/i);
    await userEvent.type(chips, "merit{Enter}minority{Enter}regional{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("scholarships");
    expect(body.patch.profile).toEqual(["merit", "minority", "regional"]);
  });

  it("round-trips scholarship chips: removing one drops it from the payload", async () => {
    const fetchMock = okFetch();
    render(<MoneyScholarshipsEditor initial={{ scholarships: { profile: ["merit", "regional"] } }} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove regional/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("scholarships");
    expect(body.patch.profile).toEqual(["merit"]);
  });

  it("PATCHes both sections when both changed, with one Saved notice", async () => {
    const fetchMock = okFetch();
    render(<MoneyScholarshipsEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Total funds available/i), "100");
    await userEvent.type(screen.getByLabelText(/Scholarship profile/i), "merit{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies(fetchMock).map((b) => b.section)).toEqual(["finance", "scholarships"]);
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<MoneyScholarshipsEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Total funds available/i), "100");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
