import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchesTabs } from "@/components/matches/matches-tabs";

function renderTabs() {
  return render(
    <MatchesTabs
      universities={<div data-testid="uni">U</div>}
      scholarships={<div data-testid="sch">S</div>}
      cost={<div data-testid="co">C</div>}
    />,
  );
}

describe("MatchesTabs", () => {
  it("renders a tablist of three tabs with universities selected by default", () => {
    renderTabs();
    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Universities/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Scholarships/i })).toHaveAttribute("aria-selected", "false");
    // only the active panel's content is in the document
    expect(screen.getByTestId("uni")).toBeInTheDocument();
    expect(screen.queryByTestId("sch")).toBeNull();
  });

  it("wires the tabpanel to the selected tab (aria-controls / aria-labelledby)", () => {
    renderTabs();
    const activeTab = screen.getByRole("tab", { name: /Universities/i });
    const panel = screen.getByRole("tabpanel");
    expect(activeTab.id).toBeTruthy();
    expect(panel.id).toBeTruthy();
    expect(activeTab.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.getAttribute("aria-labelledby")).toBe(activeTab.id);
  });

  it("uses roving tabindex — only the selected tab is in the tab order", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: /Universities/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /Scholarships/i })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: /Cost/i })).toHaveAttribute("tabindex", "-1");
  });

  it("conveys the active tab beyond colour (aria-selected + a weight cue, WCAG 1.4.1)", () => {
    renderTabs();
    const activeTab = screen.getByRole("tab", { name: /Universities/i });
    expect(activeTab).toHaveAttribute("aria-selected", "true");
    expect(activeTab.className).toMatch(/font-medium/);
  });

  it("reserves the bold (active) width on every tab so selection never nudges siblings", () => {
    // The active tab is font-medium (wider) while inactive tabs are not; without a
    // reserved width the tablist reflows on every switch. Each tab carries a hidden,
    // aria-hidden bold ghost of its own label that pins the width to the bold size,
    // so an *inactive* tab is not itself bold yet still occupies the bold footprint.
    renderTabs();
    const inactive = screen.getByRole("tab", { name: /Scholarships/i });
    expect(inactive.className).not.toMatch(/font-medium/);
    const ghost = inactive.querySelector('[aria-hidden="true"]');
    expect(ghost).not.toBeNull();
    expect(ghost).toHaveTextContent("Scholarships");
    expect(ghost?.className).toMatch(/font-medium/);
    expect(ghost?.className).toMatch(/invisible/);
  });

  it("switches panels on click and moves selection", async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.click(screen.getByRole("tab", { name: /Scholarships/i }));
    expect(screen.getByRole("tab", { name: /Scholarships/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Universities/i })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByTestId("sch")).toBeInTheDocument();
    expect(screen.queryByTestId("uni")).toBeNull();
  });

  it("ArrowRight selects the next tab and wraps; focus follows it (automatic activation)", async () => {
    const user = userEvent.setup();
    renderTabs();
    screen.getByRole("tab", { name: /Universities/i }).focus();
    await user.keyboard("{ArrowRight}");
    const sch = screen.getByRole("tab", { name: /Scholarships/i });
    expect(sch).toHaveAttribute("aria-selected", "true");
    expect(sch).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /Cost/i })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowRight}"); // wraps back to the first
    expect(screen.getByRole("tab", { name: /Universities/i })).toHaveAttribute("aria-selected", "true");
  });

  it("ArrowLeft from the first tab wraps to the last", async () => {
    const user = userEvent.setup();
    renderTabs();
    screen.getByRole("tab", { name: /Universities/i }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /Cost/i })).toHaveAttribute("aria-selected", "true");
  });

  it("Home and End jump to the first and last tab", async () => {
    const user = userEvent.setup();
    renderTabs();
    screen.getByRole("tab", { name: /Universities/i }).focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: /Cost/i })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: /Universities/i })).toHaveAttribute("aria-selected", "true");
  });
});
