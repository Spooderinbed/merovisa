import { describe, it, expect } from "vitest";

describe("test environment stubs", () => {
  it("exposes matchMedia defaulting to no-match", () => {
    expect(typeof window.matchMedia).toBe("function");
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });
  it("exposes a non-firing IntersectionObserver", () => {
    expect(typeof window.IntersectionObserver).toBe("function");
    const io = new IntersectionObserver(() => {});
    expect(() => { io.observe(document.body); io.disconnect(); }).not.toThrow();
  });
});
