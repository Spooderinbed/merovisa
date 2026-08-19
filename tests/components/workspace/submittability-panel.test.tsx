import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { SubmittabilityPanel } from "@/components/workspace/submittability-panel";
import { CaseDecisionStrip } from "@/components/workspace/case-decision-strip";
import type { LodgementRead } from "@/lib/cases/lodgement";

/**
 * MV-183 — the submittability read (spec §3, "Submittability read").
 *
 * This is the highest-trust real estate in the product: the panel a consultancy
 * looks at to decide whether a case can go. So most of what is asserted here is
 * what the panel must NOT say — no percentage, no denominator, no progress bar, no
 * word that claims a document was checked, and above all no reassuring state when
 * the read failed.
 */

const BASE = "/workspace/org-1/students/case-1";

const blocked: LodgementRead = {
  state: "blocked",
  blocker: { id: "req-1", title: "Passport bio page", dueAt: "2026-08-20T00:00:00.000Z" },
  otherOutstanding: 0,
};

function renderPanel(read: LodgementRead) {
  return render(<SubmittabilityPanel read={read} base={BASE} />);
}

describe("SubmittabilityPanel — the label and the word", () => {
  it("is labelled Lodgement", () => {
    renderPanel(blocked);
    expect(screen.getByRole("region", { name: /lodgement/i })).toBeTruthy();
  });

  it("says Blocked, in words, for an outstanding request", () => {
    renderPanel(blocked);
    expect(screen.getByText("Blocked")).toBeTruthy();
  });

  it("says Nothing outstanding when every request has resolved", () => {
    renderPanel({ state: "clear" });
    expect(screen.getByText("Nothing outstanding")).toBeTruthy();
  });

  it("says Nothing requested yet when no request was ever made", () => {
    renderPanel({ state: "nothing-requested" });
    expect(screen.getByText("Nothing requested yet")).toBeTruthy();
  });

  it("never claims the case is ready, verified, approved or submittable", () => {
    for (const read of [
      blocked,
      { state: "clear" } as const,
      { state: "nothing-requested" } as const,
      { state: "none-outstanding" } as const,
      { state: "unavailable" } as const,
    ]) {
      const { container, unmount } = renderPanel(read);
      // Asserted on the STATE WORD, not on the whole panel: the scope note below it
      // contains "checked or approved" as a DENIAL, and a substring scan cannot tell
      // a claim from its refusal.
      const word = container.querySelector("[data-lodgement-word]")?.textContent ?? "";
      expect(word.toLowerCase()).not.toMatch(/ready|verified|approved|submittable|lodge/);
      unmount();
    }
  });

  it("states the limit of the read in every settled state, not only the reassuring one", () => {
    // The word is only half the honesty; a reader who takes it at face value should
    // meet its boundary in the same glance.
    for (const read of [
      blocked,
      { state: "clear" } as const,
      { state: "nothing-requested" } as const,
      { state: "none-outstanding" } as const,
    ]) {
      const { unmount } = renderPanel(read);
      expect(screen.getByText(/nothing here has been checked or approved/i)).toBeTruthy();
      expect(screen.getByText(/only as complete as the requests on it/i)).toBeTruthy();
      unmount();
    }
  });
});

describe("SubmittabilityPanel — colour is never the only carrier of meaning", () => {
  const tone = (read: LodgementRead) => {
    const { container, unmount } = renderPanel(read);
    const el = container.querySelector("[data-lodgement-word]");
    const cls = el?.getAttribute("class") ?? "";
    const word = el?.textContent ?? "";
    unmount();
    return { cls, word };
  };

  it("uses Reach for blocked, with the word present", () => {
    const { cls, word } = tone(blocked);
    expect(cls).toContain("reach");
    expect(word).toBe("Blocked");
  });

  it("uses Strong for a fully-chased case, with the word present", () => {
    const { cls, word } = tone({ state: "clear" });
    expect(cls).toContain("strong");
    expect(word).toBe("Nothing outstanding");
  });

  it("uses Possible for a case nothing has been asked of, with the word present", () => {
    const { cls, word } = tone({ state: "nothing-requested" });
    expect(cls).toContain("possible");
    expect(word).toBe("Nothing requested yet");
  });

  it("gives an unavailable read NO state colour at all", () => {
    const { container } = renderPanel({ state: "unavailable" });
    const el = container.querySelector("[data-lodgement-word]");
    // No word, so no band: an outage must not wear a state's clothes.
    expect(el).toBeNull();
  });
});

describe("SubmittabilityPanel — one blocking item, never a list", () => {
  it("names the single blocking item", () => {
    renderPanel(blocked);
    expect(screen.getByText(/Passport bio page/)).toBeTruthy();
  });

  it("still names exactly one item when several are outstanding", () => {
    const { container } = renderPanel({
      state: "blocked",
      blocker: { id: "req-1", title: "Passport bio page", dueAt: null },
      otherOutstanding: 2,
    });
    // No list markup anywhere — the chase list is the Documents route's job.
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.querySelectorAll("ul, ol")).toHaveLength(0);
  });

  it("says how many OTHER requests are outstanding, so one item never reads as all of them", () => {
    renderPanel({
      state: "blocked",
      blocker: { id: "req-1", title: "Passport bio page", dueAt: null },
      otherOutstanding: 2,
    });
    expect(screen.getByText(/2 other requests are also outstanding/i)).toBeTruthy();
  });

  it("says nothing about others when the named item is the only one", () => {
    renderPanel(blocked);
    expect(screen.queryByText(/other requests?/i)).toBeNull();
  });

  it("shows the due date when the request carries one", () => {
    renderPanel(blocked);
    expect(screen.getByText(/20 Aug 2026/)).toBeTruthy();
  });

  it("says nothing about a due date when the request has none", () => {
    renderPanel({
      state: "blocked",
      blocker: { id: "req-1", title: "Passport bio page", dueAt: null },
      otherOutstanding: 0,
    });
    expect(screen.queryByText(/^Due /)).toBeNull();
  });
});

describe("SubmittabilityPanel — no completion claim of any kind", () => {
  const READS: LodgementRead[] = [
    blocked,
    { state: "blocked", blocker: { id: "r", title: "Bank statement", dueAt: null }, otherOutstanding: 5 },
    { state: "clear" },
    { state: "nothing-requested" },
    { state: "none-outstanding" },
    { state: "unavailable" },
  ];

  it("renders no percentage anywhere — Stage 4 has no truthful denominator", () => {
    for (const read of READS) {
      const { container, unmount } = renderPanel(read);
      expect(container.textContent ?? "").not.toMatch(/%|percent/i);
      unmount();
    }
  });

  it("renders no 'x of y' denominator anywhere", () => {
    for (const read of READS) {
      const { container, unmount } = renderPanel(read);
      expect(container.textContent ?? "").not.toMatch(/\b\d+\s*(of|\/)\s*\d+\b/);
      unmount();
    }
  });

  it("renders no progress element or meter anywhere", () => {
    for (const read of READS) {
      const { container, unmount } = renderPanel(read);
      expect(container.querySelector("progress, meter")).toBeNull();
      expect(container.querySelector('[role="progressbar"], [role="meter"]')).toBeNull();
      expect(container.querySelector('[aria-valuenow]')).toBeNull();
      unmount();
    }
  });
});

describe("SubmittabilityPanel — a failed read is an outage, never a good state", () => {
  it("says it could not check, and shows no state word", () => {
    renderPanel({ state: "unavailable" });
    expect(screen.getByText(/couldn't check this case's document requests/i)).toBeTruthy();
    expect(screen.queryByText("Nothing outstanding")).toBeNull();
    expect(screen.queryByText("Nothing requested yet")).toBeNull();
    expect(screen.queryByText("Blocked")).toBeNull();
  });

  it("never presents a failed read as any settled state", () => {
    const { container } = renderPanel({ state: "unavailable" });
    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toMatch(/nothing outstanding|nothing requested|ready|clear/);
  });
});

describe("SubmittabilityPanel — the way to the detail", () => {
  it("links to Documents in every state, including the outage", () => {
    for (const read of [
      blocked,
      { state: "clear" } as const,
      { state: "nothing-requested" } as const,
      { state: "none-outstanding" } as const,
      { state: "unavailable" } as const,
    ]) {
      const { unmount } = renderPanel(read);
      const link = screen.getByRole("link", { name: /documents/i });
      expect(link.getAttribute("href")).toBe(`${BASE}/documents`);
      unmount();
    }
  });
});

describe("CaseDecisionStrip — the first overview region", () => {
  it("renders nothing visible when no lodgement read is supplied", () => {
    // The strip's original contract (spec §3): "until each feature ships,
    // `case-decision-strip.tsx` returns no visible placeholder".
    const { container } = render(<CaseDecisionStrip base={BASE} />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing visible when the read is explicitly absent", () => {
    const { container } = render(<CaseDecisionStrip base={BASE} lodgement={null} />);
    expect(container.textContent).toBe("");
  });

  it("occupies the region once a lodgement read exists", () => {
    render(<CaseDecisionStrip base={BASE} lodgement={blocked} />);
    expect(screen.getByRole("region", { name: /lodgement/i })).toBeTruthy();
  });

  it("shows the outage rather than nothing when the read FAILED", () => {
    // A failed read is a different fact from an absent one, and the difference is
    // the whole of spec §5: it must not silently show a good state, and it must not
    // silently show nothing either.
    render(<CaseDecisionStrip base={BASE} lodgement={{ state: "unavailable" }} />);
    expect(screen.getByText(/couldn't check this case's document requests/i)).toBeTruthy();
  });
});
