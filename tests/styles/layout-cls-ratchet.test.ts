import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MV-98 ratchet: the footer used to paint high in the viewport during streaming,
 * then jump down as the real page replaced the short `loading.tsx` fallback — a
 * visible layout shift (CLS) on every load/navigation. The fix pins the footer to
 * the viewport bottom by making the route-group shell a full-height flex column
 * (`min-h-dvh flex flex-col`) with a `flex-1` `<main>`, and gives the loading
 * skeletons a realistic reserved height. This ratchet fails if any of those
 * CLS-guard tokens are removed, so a future edit can't silently reintroduce the shift.
 *
 * Source-level assertions (not render): these are async server components that
 * `await auth.getUser()`, so they don't render cleanly in jsdom — the same reason
 * card-shell-ratchet.test.ts asserts on source. The class tokens are the invariant.
 */
function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("layout CLS ratchet (MV-98)", () => {
  // MV-180 split the signed-in shell in two, so the column that pins the footer
  // moved out of `(app)/layout.tsx` and into each shell. Both are ratcheted: the
  // student shell because it is the one with a footer to pin, and the consultancy
  // shell because a streamed queue is exactly as capable of shifting.
  it("(student) shell is a full-height flex column so the footer pins to the bottom", () => {
    const src = read("app/(app)/(student)/layout.tsx");
    expect(src).toMatch(/min-h-dvh/);
    expect(src).toMatch(/flex-col/);
    expect(src).toMatch(/\bflex\b/);
    // <main> must grow to fill the column so short content doesn't ride the footer up.
    expect(src).toMatch(/<main className="[^"]*\bflex-1\b/);
  });

  it("workspace shell is a full-height flex column with a growing main", () => {
    const src = read("app/(app)/workspace/layout.tsx");
    expect(src).toMatch(/min-h-dvh/);
    expect(src).toMatch(/flex-col/);
    expect(src).toMatch(/<main className="[^"]*\bflex-1\b/);
  });

  it("(marketing) layout shell is a full-height flex column so the footer pins to the bottom", () => {
    const src = read("app/(marketing)/layout.tsx");
    expect(src).toMatch(/min-h-dvh/);
    expect(src).toMatch(/flex-col/);
    expect(src).toMatch(/\bflex\b/);
    expect(src).toMatch(/<main className="[^"]*\bflex-1\b/);
  });

  it("(app) loading skeleton reserves realistic height so the fallback matches the page", () => {
    const src = read("app/(app)/loading.tsx");
    expect(src).toMatch(/min-h-\[60vh\]|flex-1/);
  });

  it("(marketing) loading skeleton reserves realistic height so the fallback matches the page", () => {
    const src = read("app/(marketing)/loading.tsx");
    expect(src).toMatch(/min-h-\[60vh\]|flex-1/);
  });
});
