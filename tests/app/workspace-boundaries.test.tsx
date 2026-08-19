import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import QueueLoading from "@/app/(app)/workspace/[organizationId]/loading";
import QueueError from "@/app/(app)/workspace/[organizationId]/error";
import CaseFrameLoading from "@/app/(app)/workspace/[organizationId]/students/loading";
import CaseSectionLoading from "@/app/(app)/workspace/[organizationId]/students/[caseId]/loading";
import CaseError from "@/app/(app)/workspace/[organizationId]/students/[caseId]/error";
import TeamLoading from "@/app/(app)/workspace/[organizationId]/team/loading";
import TeamError from "@/app/(app)/workspace/[organizationId]/team/error";
import SettingsLoading from "@/app/(app)/workspace/[organizationId]/settings/loading";

/**
 * MV-184 — the workspace's own loading and error boundaries (spec §5, and §6's
 * "split [the shared (app) states] into student and workspace variants while
 * preserving the honest failure semantics").
 *
 * These render each default export DIRECTLY. Where Next mounts a route-segment
 * file is the framework's contract, not this repo's, and jsdom has no layout
 * engine — so shape and placement are proven in the live browser pass recorded on
 * the card, and these tests pin the things a browser pass cannot re-check on every
 * commit: the counts, the copy, and the absences.
 */

const WORKSPACE_BOUNDARY_FILES = [
  "app/(app)/workspace/[organizationId]/loading.tsx",
  "app/(app)/workspace/[organizationId]/error.tsx",
  "app/(app)/workspace/[organizationId]/students/loading.tsx",
  "app/(app)/workspace/[organizationId]/students/[caseId]/loading.tsx",
  "app/(app)/workspace/[organizationId]/students/[caseId]/error.tsx",
  "app/(app)/workspace/[organizationId]/team/loading.tsx",
  "app/(app)/workspace/[organizationId]/team/error.tsx",
  "app/(app)/workspace/[organizationId]/settings/loading.tsx",
] as const;

const LOADING_STATES = [
  ["queue", QueueLoading],
  ["case frame", CaseFrameLoading],
  ["case section", CaseSectionLoading],
  ["team", TeamLoading],
  ["settings", SettingsLoading],
] as const;

/** Every line of a source file. CRLF working tree — splitting on "\n" alone makes
 *  line assertions vacuously true (MISTAKES.md). */
function lines(path: string): string[] {
  return readFileSync(path, "utf8").split(/\r?\n/);
}

describe("workspace queue loading", () => {
  it("shows the heading block, the summary strip, the toolbar and EXACTLY eight rows", () => {
    const { container } = render(<QueueLoading />);
    expect(container.querySelector('[data-testid="queue-heading-skeleton"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="queue-summary-skeleton"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="queue-toolbar-skeleton"]')).not.toBeNull();
    // An exact count, not a presence check: a presence assertion survives someone
    // dropping the queue to one row or padding it to twenty.
    expect(container.querySelectorAll('[data-testid="queue-row-skeleton"]')).toHaveLength(8);
  });

  it("names no route, because this boundary also covers All cases and Add a student", () => {
    render(<QueueLoading />);
    expect(screen.queryByText(/day view/i)).toBeNull();
    expect(screen.queryByText(/all cases/i)).toBeNull();
  });
});

describe("workspace case-frame loading", () => {
  it("shows a case-header skeleton, the section rail, and exactly two content panels", () => {
    const { container } = render(<CaseFrameLoading />);
    expect(container.querySelector('[data-testid="case-header-skeleton"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="case-rail-skeleton"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="case-panel-skeleton"]')).toHaveLength(2);
  });

  it("lives one segment ABOVE the case, which is the only place it can cover the frame", () => {
    // A route-segment `loading.tsx` renders inside its OWN segment's layout, so a
    // frame silhouette placed at `[caseId]/` can only appear once the frame it
    // depicts is already on screen. Measured in the browser: before this file
    // existed, opening one student rendered the organization queue's eight-row
    // skeleton, because that was the nearest ancestor boundary.
    expect(() =>
      readFileSync("app/(app)/workspace/[organizationId]/students/loading.tsx", "utf8"),
    ).not.toThrow();
  });

  it("names no student, because a skeleton knows nothing about whose case this is", () => {
    const { container } = render(<CaseFrameLoading />);
    // The only readable text is the assistive-tech announcement.
    expect(container.textContent?.trim()).toBe("Loading…");
  });

  it("shares the frame's own grid, so it collapses at the same width the frame does", () => {
    // jsdom has no layout engine and cannot see a breakpoint. What it CAN prove is
    // that the skeleton's grid container is the frame's, character for character —
    // and the frame's responsive behaviour is already shipped and browser-verified.
    // Parity is the durable assertion; a screenshot rots the moment either changes.
    const grid = (path: string) =>
      lines(path)
        .map((line) => /className="([^"]*md:grid[^"]*)"/.exec(line)?.[1])
        .find(Boolean);

    const frame = grid("app/(app)/workspace/[organizationId]/students/[caseId]/layout.tsx");
    expect(frame, "the case frame's grid container").toContain("md:grid");
    expect(grid("app/(app)/workspace/[organizationId]/students/loading.tsx")).toBe(frame);
  });
});

describe("workspace case-section loading", () => {
  it("shows exactly two content panels", () => {
    const { container } = render(<CaseSectionLoading />);
    expect(container.querySelectorAll('[data-testid="case-panel-skeleton"]')).toHaveLength(2);
  });

  it("draws NO second header and NO second rail — the real frame is already up", () => {
    // This is the bug the browser pass caught: rendering inside the resolved case
    // layout, a header skeleton sits beneath the real student name and the rail
    // skeleton beside the real section nav. Both are duplicates, not skeletons.
    const { container } = render(<CaseSectionLoading />);
    expect(container.querySelector('[data-testid="case-header-skeleton"]')).toBeNull();
    expect(container.querySelector('[data-testid="case-rail-skeleton"]')).toBeNull();
  });
});

describe("workspace team and settings loading", () => {
  it("keeps each page's own heading and skeletons only the content below it", () => {
    render(<TeamLoading />);
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();

    render(<SettingsLoading />);
    expect(screen.getByRole("heading", { name: "Organization settings" })).toBeInTheDocument();
  });

  it("leaves the consultancy shell to the layouts above rather than redrawing it", () => {
    // The shell (top bar + organization rail) is mounted by
    // `workspace/layout.tsx` and `[organizationId]/layout.tsx`. A loading file
    // that rendered its own copy would double the chrome the moment it appeared —
    // which is the failure mode "preserve the workspace shell" is guarding.
    for (const path of WORKSPACE_BOUNDARY_FILES) {
      const source = lines(path).join("\n");
      expect(source, path).not.toMatch(/WorkspaceTopBar|OrgRail/);
    }
  });
});

describe("every workspace loading state", () => {
  it.each(LOADING_STATES)("announces %s loading to assistive tech", (_name, Loading) => {
    const { container } = render(<Loading />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it.each(LOADING_STATES)("uses no spinner in the %s skeleton", (_name, Loading) => {
    const { container } = render(<Loading />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    for (const element of container.querySelectorAll("*")) {
      expect(element.className.toString()).not.toMatch(/spin/);
    }
  });

  it.each(LOADING_STATES)("staggers nothing in the %s skeleton", (_name, Loading) => {
    const { container } = render(<Loading />);
    for (const element of container.querySelectorAll("*")) {
      expect((element as HTMLElement).style.animationDelay).toBe("");
      expect(element.className.toString()).not.toMatch(/\bdelay-/);
    }
  });
});

describe("reduced-motion guard", () => {
  it("still collapses every animation under prefers-reduced-motion: reduce", () => {
    const globals = lines("app/globals.css");
    const start = globals.findIndex((line) =>
      /@media \(prefers-reduced-motion: reduce\)/.test(line),
    );
    expect(start, "the global reduced-motion block").toBeGreaterThan(-1);
    const block = globals.slice(start, start + 12).join("\n");
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
  });

  it("keeps every workspace skeleton inside that guard — no bespoke animation", () => {
    // The guard works by overriding `animation-duration` on every element, so a
    // skeleton is covered exactly as long as it animates through the shared
    // `animate-pulse` utility. An inline style or a local @keyframes would still
    // be caught by the `*` selector, but a JS-driven one would not — and either
    // is a second motion vocabulary this design language does not have.
    for (const path of WORKSPACE_BOUNDARY_FILES) {
      const source = lines(path).join("\n");
      expect(source, path).not.toMatch(/@keyframes|animation:|animationName|requestAnimationFrame/);
    }
  });
});

describe("workspace queue error boundary", () => {
  it("says the queue could not load and retries", async () => {
    const reset = vi.fn();
    render(<QueueError error={new Error("queue read blew up")} reset={reset} />);
    expect(screen.getByText(/couldn.t load this queue/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("makes no empty-case claim — a failure is not an empty queue", () => {
    render(<QueueError error={new Error("queue read blew up")} reset={vi.fn()} />);
    expect(screen.queryByText(/no cases/i)).toBeNull();
    expect(screen.queryByText(/nothing needs action/i)).toBeNull();
    expect(screen.queryByText(/no students/i)).toBeNull();
  });
});

describe("workspace case error boundary", () => {
  it("says the student could not load and retries", async () => {
    const reset = vi.fn();
    render(<CaseError error={new Error("case read blew up")} reset={reset} />);
    expect(screen.getByText(/couldn.t load this student/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("workspace team error boundary", () => {
  it("keeps the team heading and uses the page's own outage wording", async () => {
    const reset = vi.fn();
    render(<TeamError error={new Error("roster read blew up")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Team" })).toBeInTheDocument();
    // Verbatim `TeamLookupFailedCard` (app/(app)/workspace/[organizationId]/team/page.tsx),
    // so the boundary and the page cannot drift into two different sentences.
    expect(screen.getByText(/couldn.t load the team/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("an outage is never dressed up as a denial", () => {
  // `lookup-failed` is always an outage, never a permission denial (spec §5, and
  // MISTAKES.md). Permission denials call `notFound()`; a boundary that borrowed
  // denial vocabulary would tell a counsellor they lack access because Supabase
  // blipped, and send them to ask a colleague instead of retrying.
  const ERRORS = [
    ["queue", QueueError],
    ["case", CaseError],
    ["team", TeamError],
  ] as const;

  it.each(ERRORS)("keeps denial vocabulary out of the %s boundary", (_name, Boundary) => {
    const { container } = render(<Boundary error={new Error("read failed")} reset={vi.fn()} />);
    expect(container.textContent).not.toMatch(
      /permission|not allowed|forbidden|denied|no access|does not exist|doesn.t exist/i,
    );
  });

  it.each(ERRORS)("states the failure is ours, not the reader's, in the %s boundary", (_name, Boundary) => {
    render(<Boundary error={new Error("read failed")} reset={vi.fn()} />);
    expect(screen.getByText(/on our side/i)).toBeInTheDocument();
  });
});
