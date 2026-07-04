import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  StudyCareerEditor,
  buildIntendedStudyPatch,
} from "@/components/profile/editors/study-career-editor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const okFetch = () =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 }),
  );

const bodies = (fetchMock: ReturnType<typeof okFetch>) =>
  fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));

describe("StudyCareerEditor", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders existing study and career values in inputs", () => {
    render(
      <StudyCareerEditor
        initial={{
          "intended-study": { level: "masters", field: "computer-science", specialisation: "AI" },
          career: { goal: "permanent-residency", targetRole: "Software engineer" },
        }}
      />,
    );
    expect(screen.getByLabelText(/Level/i)).toHaveValue("masters");
    expect(screen.getByLabelText(/Field/i)).toHaveValue("computer-science");
    expect(screen.getByLabelText(/Specialisation/i)).toHaveValue("AI");
    expect(screen.getByLabelText(/Career goal/i)).toHaveValue("permanent-residency");
    expect(screen.getByLabelText(/Target role/i)).toHaveValue("Software engineer");
  });

  it("keeps target role as free text", () => {
    render(<StudyCareerEditor initial={{}} />);
    const input = screen.getByLabelText(/Target role/i);
    expect(input.tagName).toBe("INPUT");
  });

  it("PATCHes only intended-study when just study fields changed", async () => {
    const fetchMock = okFetch();
    render(<StudyCareerEditor initial={{ career: { goal: "research" } }} />);
    await userEvent.selectOptions(screen.getByLabelText(/Level/i), "masters");
    await userEvent.selectOptions(screen.getByLabelText(/Field/i), "data-science");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("intended-study");
    expect(body.patch.level).toBe("masters");
    expect(body.patch.field).toBe("data-science");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("PATCHes only career when just career fields changed", async () => {
    const fetchMock = okFetch();
    render(<StudyCareerEditor initial={{ "intended-study": { level: "masters" } }} />);
    await userEvent.selectOptions(screen.getByLabelText(/Career goal/i), "best-employment");
    await userEvent.type(screen.getByLabelText(/Target role/i), "Data analyst");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("career");
    expect(body.patch.goal).toBe("best-employment");
    expect(body.patch.targetRole).toBe("Data analyst");
  });

  it("PATCHes both sections when both changed, with one Saved notice", async () => {
    const fetchMock = okFetch();
    render(<StudyCareerEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Field/i), "other");
    await userEvent.selectOptions(screen.getByLabelText(/Career goal/i), "research");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies(fetchMock).map((b) => b.section)).toEqual(["intended-study", "career"]);
    expect(await screen.findAllByText("Saved")).toHaveLength(1);
  });

  // MV-102 M1 — the intended-study patch must ALWAYS carry alsoConsidering (an
  // empty array when none), so the shallow-merge in repo.ts clears dropped extras.
  // An omitted key would leave stale secondary bands persisted forever.
  describe("buildIntendedStudyPatch always sends alsoConsidering (clears stale extras)", () => {
    it("sends an empty array when no extras are selected", () => {
      const patch = buildIntendedStudyPatch({
        level: "masters",
        field: "computer-science",
        alsoConsidering: [],
        specialisation: "",
      });
      expect(patch.alsoConsidering).toEqual([]);
    });

    it("sends the selected extras when present", () => {
      const patch = buildIntendedStudyPatch({
        level: "",
        field: "computer-science",
        alsoConsidering: ["business"],
        specialisation: "",
      });
      expect(patch.alsoConsidering).toEqual(["business"]);
    });
  });

  it("clears also-considering on save when the last extra is removed (empty array persisted)", async () => {
    const fetchMock = okFetch();
    render(
      <StudyCareerEditor
        initial={{ "intended-study": { field: "computer-science", alsoConsidering: ["business"] } }}
      />,
    );
    // Untick the only extra, then save.
    await userEvent.click(screen.getByRole("checkbox", { name: /Business/i }));
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [body] = bodies(fetchMock);
    expect(body.section).toBe("intended-study");
    expect(body.patch.alsoConsidering).toEqual([]);
  });

  it("shows an error notice on non-200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("err", { status: 422 }));
    render(<StudyCareerEditor initial={{}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Field/i), "other");
    await userEvent.click(screen.getByRole("button", { name: /Save/i }));
    expect(await screen.findByText(/Couldn't save/i)).toBeInTheDocument();
  });
});
