import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics/events", () => ({ track }));

import { EmailInsteadLink } from "@/components/auth/email-instead-link";

const ASSESSMENT_UUID = "11815637-f603-4821-8dd0-d9e52560c4f6";

describe("EmailInsteadLink", () => {
  beforeEach(() => track.mockReset());

  // jsdom has no navigation, so letting a real anchor click through prints a
  // "Not implemented" warning. Swallow the default; React's onClick still runs.
  const swallowNavigation = (e: Event) => e.preventDefault();
  beforeEach(() => document.addEventListener("click", swallowNavigation, true));
  afterEach(() => document.removeEventListener("click", swallowNavigation, true));

  // The results page is where an anonymous assessment is won or lost. Google is the
  // primary button, so without this a student who has no Google account reaches the
  // conversion moment with no way through it.
  it("sends the student to /auth carrying the assessment to claim", () => {
    render(<EmailInsteadLink assessmentId={ASSESSMENT_UUID} />);
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute(
      "href",
      `/auth?assessment=${ASSESSMENT_UUID}`,
    );
  });

  it("renders nothing when there is no assessment to claim", () => {
    const { container } = render(<EmailInsteadLink assessmentId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts as a gate CTA so the funnel doesn't under-report the email path", async () => {
    render(<EmailInsteadLink assessmentId={ASSESSMENT_UUID} />);
    await userEvent.click(screen.getByRole("link", { name: /email/i }));
    expect(track).toHaveBeenCalledWith("gate_cta_clicked");
  });
});
