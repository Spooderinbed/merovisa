import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkGapEditor } from "@/components/profile/editors/work-gap-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const okFetch = () =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

const bodies = (fetchMock: ReturnType<typeof okFetch>) =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

describe("WorkGapEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing work and gap values in inputs", () => {
    render(
      <WorkGapEditor
        initial={{
          work: { title: "Engineer", years: 3, relevance: "related", docs: true },
          gap: { years: 2, reasons: ["worked", "health-family"], evidence: ["pay slip", "letter"] },
        }}
      />,
    );
    expect(screen.getByLabelText(/Title/i)).toHaveValue("Engineer");
    expect(screen.getByLabelText(/^Years$/i)).toHaveValue(3);
    expect(screen.getByLabelText(/Relevance/i)).toHaveValue("related");
    expect(screen.getByLabelText(/Years of gap/i)).toHaveValue(2);
    expect(screen.getByLabelText(/Worked/i)).toBeChecked();
    expect(screen.getByLabelText(/Health or family/i)).toBeChecked();
    expect(screen.getByRole("button", { name: /Remove pay slip/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove letter/i })).toBeInTheDocument();
  });

  it("frames the work section as optional context that doesn't change the verdict (MV-03)", () => {
    // No scorer reads work title/years/relevance — title only tailors the document
    // checklist; the verdict's work credit comes from the separate gap reason
    // "worked". So the section must not imply it moves the verdict.
    render(<WorkGapEditor initial={{}} />);
    expect(screen.getByText(/tailor your document checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't change your verdict/i)).toBeInTheDocument();
  });

  it("shows Documents page hint", () => {
    render(<WorkGapEditor initial={{}} />);
    const link = screen.getByRole("link", { name: /Documents page/i });
    expect(link).toHaveAttribute("href", "/documents");
  });

  it("PATCHes only work when just work fields changed", async () => {
    const fetchMock = okFetch();
    render(<WorkGapEditor initial={{ gap: { years: 1 } }} />);
    await userEvent.type(screen.getByLabelText(/Title/i), "Junior Developer");
    await userEvent.type(screen.getByLabelText(/^Years$/i), "2");
    await userEvent.selectOptions(screen.getByLabelText(/Relevance/i), "directly-related");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("work");
    expect(body.patch.title).toBe("Junior Developer");
    expect(body.patch.years).toBe(2);
    expect(body.patch.relevance).toBe("directly-related");
    expect(body.patch.docs).toBeUndefined();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("PATCHes only gap with reasons and evidence chips when just gap changed", async () => {
    const fetchMock = okFetch();
    render(<WorkGapEditor initial={{ work: { title: "Engineer" } }} />);
    await userEvent.type(screen.getByLabelText(/Years of gap/i), "3");
    await userEvent.click(screen.getByLabelText(/Worked/i));
    await userEvent.click(screen.getByLabelText(/Health or family/i));
    await userEvent.type(screen.getByLabelText(/Evidence/i), "doc1{Enter}doc2{Enter}");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("gap");
    expect(body.patch.years).toBe(3);
    expect(body.patch.reasons).toEqual(expect.arrayContaining(["worked", "health-family"]));
    expect(body.patch.evidence).toEqual(["doc1", "doc2"]);
  });

  it("round-trips evidence chips: removing one drops it from the payload", async () => {
    const fetchMock = okFetch();
    render(<WorkGapEditor initial={{ gap: { years: 2, evidence: ["pay slip", "letter"] } }} />);
    await userEvent.click(screen.getByRole("button", { name: /Remove pay slip/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("gap");
    expect(body.patch.evidence).toEqual(["letter"]);
  });

  it("PATCHes both sections when both changed, with one Saved notice", async () => {
    const fetchMock = okFetch();
    render(<WorkGapEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Title/i), "Engineer");
    await userEvent.type(screen.getByLabelText(/Years of gap/i), "1");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies(fetchMock).map((b) => b.section)).toEqual(["work", "gap"]);
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<WorkGapEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Title/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
