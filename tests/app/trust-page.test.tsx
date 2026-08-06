import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TrustPage from "@/app/(marketing)/trust/page";

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

const deletionParagraph = (container: HTMLElement) => {
  const found = Array.from(container.querySelectorAll("p"))
    .map((p) => norm(p.textContent))
    .find((text) => /delete your account at any time/i.test(text));
  expect(found).toBeDefined();
  return found as string;
};

describe("/trust transparency page", () => {
  // MV-162 adversarial pass: the delete-account control moved off /profile onto
  // /settings. The trust page still sent students to the profile page, so the one
  // page whose whole job is being trustworthy pointed at a control that is not
  // there. Pin the destination so it cannot rot away from the route again.
  it("sends students to the settings page to delete their account", () => {
    const { container } = render(<TrustPage />);
    expect(deletionParagraph(container)).toMatch(/settings page/i);
  });

  it("no longer names the profile page as the place to delete an account", () => {
    const { container } = render(<TrustPage />);
    expect(deletionParagraph(container)).not.toMatch(/profile page/i);
  });

  // MV-162 item 6: the reviewer called the stunted rules out on /how. /trust is the
  // structural twin two nav items away, so the same treatment holds here — rules out,
  // section rhythm carrying the separation instead.
  it("draws no horizontal rule between the sections", () => {
    const { container } = render(<TrustPage />);
    expect(container.querySelectorAll("hr")).toHaveLength(0);
  });

  it("draws no border-drawn divider standing in for the removed rules", () => {
    const { container } = render(<TrustPage />);
    const ruled = Array.from(container.querySelectorAll("*")).filter((el) =>
      /(^|\s|:)border-[tby](-|\s|$)/.test(el.className.toString()),
    );
    expect(ruled.map((el) => el.className.toString())).toEqual([]);
  });

  it("keeps the section rhythm in step with its /how twin", () => {
    const { container } = render(<TrustPage />);
    expect(container.querySelector(".space-y-12")).not.toBeNull();
    expect(container.querySelector(".space-y-10")).toBeNull();
  });

  it("renders the five section headings", () => {
    render(<TrustPage />);
    for (const heading of [
      "No referral fees, no agent partnerships",
      "What data we collect, and why",
      "Where the data lives",
      "When we delete your data",
      "Questions and corrections",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });
});
