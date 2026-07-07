import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MV-108 ratchet (A3 — landing restyle).
 *
 * The imagery policy (docs/imagery-policy.md) bans flag iconography on marketing
 * surfaces — a destination is marked with a neutral, flag-free mono ISO pill
 * (`components/ui/iso-pill.tsx`), never a regional-indicator flag emoji.
 *
 * ESLint can't see emoji in JSX text, so — like the motion-tokens and type-scale
 * ratchets — enforcement lives here. A reintroduced 🇦🇺-style flag under the
 * marketing or destinations component trees now fails CI. Scoped to those two
 * dirs only (signed-in / dashboard surfaces are out of scope for this policy).
 */
const FLAG_EMOJI = /[\u{1F1E6}-\u{1F1FF}]/u;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe("no marketing flag emoji ratchet (MV-108)", () => {
  it("no marketing or destinations component contains a regional-indicator flag emoji", () => {
    const offenders: string[] = [];
    for (const root of ["components/marketing", "components/destinations"]) {
      for (const file of sourceFiles(root)) {
        if (FLAG_EMOJI.test(readFileSync(file, "utf8"))) offenders.push(file.replace(/\\/g, "/"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
