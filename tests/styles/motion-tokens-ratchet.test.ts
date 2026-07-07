import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MV-107 ratchet (Motion v2 ADR — docs/design/2026-07-03-motion-v2-adr.md).
 *
 * The ADR fences the app's motion system:
 *   - durations come from the named `--transition-duration-*` ladder, never raw
 *     `duration-150` / `duration-[Nms]` magic numbers (ADR §3, open-Q 1);
 *   - `transition-all` is banned — it animates layout props and is unpredictable
 *     (ADR §2, adoption item 1).
 *
 * ESLint can't see Tailwind class strings, so — like the card-shell and
 * type-scale ratchets — enforcement lives here. A new raw duration or a
 * `transition-all` now fails CI. The JS-animation-library ban (ADR §1) is a
 * separate concern, enforced by `no-restricted-imports` in eslint.config.mjs and
 * the dependency check below.
 */
const RAW_DURATION = /\bduration-(?:\d|\[)/;
const TRANSITION_ALL = /\btransition-all\b/;

const DURATION_TOKENS = [
  "--transition-duration-fast",
  "--transition-duration-medium",
  "--transition-duration-slow",
  "--transition-duration-slower",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function scan(pattern: RegExp): string[] {
  const offenders: string[] = [];
  for (const root of ["components", "app"]) {
    for (const file of sourceFiles(root)) {
      if (pattern.test(readFileSync(file, "utf8"))) offenders.push(file.replace(/\\/g, "/"));
    }
  }
  return offenders;
}

describe("motion tokens ratchet (MV-107)", () => {
  const globals = readFileSync("app/globals.css", "utf8");

  it("defines the named duration ladder in @theme", () => {
    for (const token of DURATION_TOKENS) {
      expect(globals).toContain(token);
    }
  });

  it("no component uses a raw duration utility — use duration-fast/medium/slow/slower", () => {
    expect(scan(RAW_DURATION)).toEqual([]);
  });

  it("no component uses transition-all — name the animated properties (Motion v2 ADR)", () => {
    expect(scan(TRANSITION_ALL)).toEqual([]);
  });

  it("no JS animation library is a dependency — motion is CSS-first (Motion v2 ADR)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of ["framer-motion", "motion", "gsap"]) {
      expect(deps).not.toHaveProperty(banned);
    }
  });
});
