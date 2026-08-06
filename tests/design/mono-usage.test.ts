import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MV-162 typography rule: mono (IBM Plex Mono) is for DATA TOKENS ONLY —
 * numbers, dates, currency figures, ranges, percentages, codes. Prose, labels,
 * eyebrows, section kickers, status chips and buttons use the sans.
 *
 * Eyebrows keep `uppercase tracking-wide` — only the FACE changed. So an
 * uppercase run in mono is, by construction, a label rather than a data token:
 * `font-mono` + `uppercase` on the same line is the drift signal.
 *
 * This walks the LIVE tree, not a snapshot of today's file list — it goes red
 * the moment someone reintroduces the pattern anywhere under app/ or components/.
 */
const SOURCE_ROOTS = ["app", "components"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });
}

describe("mono usage (MV-162)", () => {
  it("no source line carries both font-mono and uppercase — eyebrows are sans", () => {
    const offenders: string[] = [];
    for (const root of SOURCE_ROOTS) {
      for (const file of sourceFiles(root)) {
        const normalized = file.replace(/\\/g, "/");
        // CRLF working tree on Windows: splitting on "\n" alone leaves a
        // trailing \r on every line and makes end-anchored checks vacuous.
        const lines = readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, i) => {
          // Tailwind call sites (.tsx) declare the face as `font-mono`; the landing
          // page declares it in CSS as `font-family:var(--mono)`. The first sweep
          // only checked the former, so eight uppercase label/chip rules in
          // landing.css kept rendering mono on the highest-traffic page in the app.
          const mono = line.includes("font-mono") || /font-family:\s*var\(--mono\)/.test(line);
          const caps = line.includes("uppercase");
          if (mono && caps) {
            offenders.push(`${normalized}:${i + 1}: ${line.trim()}`);
          }
        });
      }
    }
    expect(offenders, `mono+uppercase offenders:\n${offenders.join("\n")}`).toEqual([]);
  });
});
