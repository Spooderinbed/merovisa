import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademicEditor } from "@/components/profile/editors/academic-editor";
import { GRADE_SYSTEMS } from "@/lib/scoring/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("AcademicEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing values in inputs", () => {
    render(<AcademicEditor initial={{ institution: "TU", degree: "bachelors", gradePercent: 78, gradeSystem: "cgpa-4" }} />);
    expect(screen.getByLabelText(/Institution/i)).toHaveValue("TU");
    expect(screen.getByLabelText(/Degree/i)).toHaveValue("bachelors");
    expect(screen.getByLabelText(/Grade percent/i)).toHaveValue(78);
    expect(screen.getByLabelText(/Grade system/i)).toHaveValue("cgpa-4");
  });

  it("offers grade system as a select over the GradeSystem enum — no free text path", () => {
    render(<AcademicEditor initial={{}} />);
    const select = screen.getByLabelText(/Grade system/i);
    expect(select.tagName).toBe("SELECT");
    const values = within(select as HTMLElement)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean);
    expect(values).toEqual([...GRADE_SYSTEMS]);
  });

  it("PATCHes with section academic including the grade system enum value", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    render(<AcademicEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Institution/i), "Kathmandu University");
    await userEvent.selectOptions(screen.getByLabelText(/Degree/i), "masters");
    await userEvent.type(screen.getByLabelText(/Grade percent/i), "82");
    await userEvent.selectOptions(screen.getByLabelText(/Grade system/i), "percentage-nepal");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.section).toBe("academic");
    expect(body.patch.institution).toBe("Kathmandu University");
    expect(body.patch.degree).toBe("masters");
    expect(body.patch.gradePercent).toBe(82);
    expect(body.patch.gradeSystem).toBe("percentage-nepal");
    expect(await screen.findByText(/Saved/i)).toBeInTheDocument();
    fetchMock.mockRestore();
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<AcademicEditor initial={{}} />);
    await userEvent.type(screen.getByLabelText(/Institution/i), "X");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
