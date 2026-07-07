import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({
  usePathname: vi.fn<() => string>(() => "/dashboard"),
}));
vi.mock("next/navigation", () => ({ usePathname }));

import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

describe("MobileTabBar", () => {
  beforeEach(() => {
    usePathname.mockReturnValue("/dashboard");
  });

  it("renders one link per core surface with correct hrefs", () => {
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: /^Home$/i })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /^Matches$/i })).toHaveAttribute("href", "/matches");
    expect(screen.getByRole("link", { name: /^My plan$/i })).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: /^Documents$/i })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("link", { name: /^Guide$/i })).toHaveAttribute("href", "/guide");
    expect(screen.getAllByRole("link")).toHaveLength(5);
  });

  it("leaves Profile to the avatar menu", () => {
    render(<MobileTabBar />);
    expect(screen.queryByRole("link", { name: /Profile/i })).toBeNull();
  });

  it("marks the active route with aria-current=page", () => {
    usePathname.mockReturnValue("/matches");
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: /^Matches$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Home$/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /^My plan$/i })).not.toHaveAttribute("aria-current");
  });

  it("treats nested paths as active for their parent tab", () => {
    usePathname.mockReturnValue("/plan/visa-prep");
    render(<MobileTabBar />);
    expect(screen.getByRole("link", { name: /^My plan$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /^Matches$/i })).not.toHaveAttribute("aria-current");
  });

  it("is hidden at md and up and pinned to the bottom with safe-area padding", () => {
    render(<MobileTabBar />);
    const bar = screen.getByTestId("mobile-tab-bar");
    expect(bar.className).toContain("md:hidden");
    expect(bar.className).toContain("fixed");
    expect(bar.className).toContain("bottom-0");
    expect(bar.className).toContain("pb-[env(safe-area-inset-bottom)]");
  });

  it("times the active-tab transition with the calm duration token", () => {
    usePathname.mockReturnValue("/matches");
    render(<MobileTabBar />);
    const active = screen.getByRole("link", { name: /^Matches$/i });
    expect(active.className).toContain("duration-fast");
  });

  it("renders an always-present accent bar that fades in on the active tab", () => {
    usePathname.mockReturnValue("/matches");
    render(<MobileTabBar />);
    const active = screen.getByRole("link", { name: /^Matches$/i });
    const inactive = screen.getByRole("link", { name: /^Home$/i });

    const activeBar = active.querySelector("[aria-hidden]");
    const inactiveBar = inactive.querySelector("[aria-hidden]");

    expect(activeBar).not.toBeNull();
    expect(inactiveBar).not.toBeNull();
    expect(activeBar?.className).toContain("opacity-100");
    expect(inactiveBar?.className).toContain("opacity-0");
    // Flat plum bar, always mounted (opacity-toggled, not conditionally rendered).
    expect(activeBar?.className).toContain("bg-primary");
    expect(activeBar?.className).toContain("h-0.5");
    expect(activeBar?.className).toContain("transition-opacity");
  });

  it("keeps the calm-motion ratchets on the active-tab markup", () => {
    usePathname.mockReturnValue("/matches");
    render(<MobileTabBar />);
    const active = screen.getByRole("link", { name: /^Matches$/i });
    expect(active.className).not.toMatch(/transition-all/);
    expect(active.className).not.toMatch(/animate-(bounce|ping|pulse)/);
    expect(active.className).not.toMatch(/duration-\d/);
  });
});
