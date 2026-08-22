/**
 * MV-192 — a `.mjs` module imported by the test lane may not carry a shebang.
 *
 * ## The failure this exists to prevent
 *
 * `tests/integration/stage2-data-equivalence.itest.ts` imported
 * `scripts/stage2/capture-read-path-snapshot.mjs`, which opened with
 * `#!/usr/bin/env node`. Vitest's SSR transform does not strip a `#!` line
 * terminated by CRLF, and the module then fails to parse, taking its importer
 * down with it:
 *
 *     FAIL  tests/integration/stage2-data-equivalence.itest.ts
 *     SyntaxError: Invalid or unexpected token
 *
 * Nineteen tests, silently not running. This is the rule already recorded in
 * `MISTAKES.md`: put the testable logic in an import-free sibling module and
 * leave the shebang on the thin CLI wrapper.
 *
 * ## WHY THIS GUARD, AND NOT THE ITEST'S OWN FAILURE
 *
 * The itest's failure is NOT a usable regression guard, because it fires only on
 * a CRLF checkout. Measured three ways on one Windows host: a CRLF-terminated
 * shebang throws, the SAME shebang with an LF ending parses, and no shebang
 * parses. So Linux CI — an LF checkout — imported that module happily and ticked
 * all nineteen tests for months while they did not run here at all. A guard that
 * is green on the machine which gates merges is not a guard.
 *
 * This file reads bytes off disk instead of importing anything, so it fails
 * identically on LF and CRLF, Windows and Linux. It deliberately does not test
 * for the CRLF ending specifically: a shebang on an imported module is a latent
 * trap the moment anyone checks the repo out on Windows, so the rule it enforces
 * is the blunt one.
 *
 * ## WHY IT IS NOT VACUOUS
 *
 * A scan-and-assert test whose scan silently matches nothing passes for the same
 * reason a correct one does. Two things stop that here: the edge count is
 * asserted to be non-trivial, and one specific long-lived edge is pinned by name.
 * Break the walker or the specifier regex and those fail before the shebang
 * assertion has a chance to go quietly green.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../..");
const TESTS_ROOT = path.join(REPO_ROOT, "tests");

/** Every `.ts`/`.tsx` file under `tests/`, absolute, both lanes (`*.test.ts` and `*.itest.ts`). */
function collectTestFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      found.push(...collectTestFiles(absolute));
    } else if (/\.tsx?$/.test(entry)) {
      found.push(absolute);
    }
  }
  return found;
}

/**
 * `from "…​.mjs"` and `await import("…​.mjs")`. Deliberately a text scan and not a
 * parse: this guard has to keep working on a file the transform currently refuses
 * to parse, which is the whole situation it exists for.
 */
const MJS_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+\.mjs)["']/g;

type Edge = { importer: string; specifier: string; line: number; resolved: string };

function collectMjsEdges(): Edge[] {
  const edges: Edge[] = [];
  for (const importer of collectTestFiles(TESTS_ROOT)) {
    const source = readFileSync(importer, "utf8");
    for (const match of source.matchAll(MJS_SPECIFIER)) {
      const specifier = match[1];
      // Only relative specifiers name a file in this repo; a bare specifier is a package.
      if (!specifier?.startsWith(".")) continue;
      edges.push({
        importer: path.relative(REPO_ROOT, importer).replace(/\\/g, "/"),
        specifier,
        // The tree is CRLF, so split on /\r?\n/ and never on "\n" alone — the habit that
        // keeps a line-oriented guard from going vacuously green on this checkout.
        line: source.slice(0, match.index ?? 0).split(/\r?\n/).length,
        resolved: path.resolve(path.dirname(importer), specifier),
      });
    }
  }
  // Stable order so a failure message reads the same on every machine.
  return edges.sort((a, b) => `${a.importer}${a.specifier}`.localeCompare(`${b.importer}${b.specifier}`));
}

const EDGES = collectMjsEdges();

describe("MV-192 — `.mjs` modules imported by the test lane", () => {
  test("the scan actually found the imports it is asserting over", () => {
    // Anti-vacuity. If the walker or the regex breaks, this fails FIRST and says so,
    // rather than letting the real assertion below pass over an empty list.
    expect(collectTestFiles(TESTS_ROOT).length, "no test files were walked at all").toBeGreaterThan(50);
    expect(EDGES.length, "no `.mjs` imports were found in tests/ — the specifier scan is broken").toBeGreaterThanOrEqual(
      5,
    );

    // One long-lived edge, pinned by name: MV-164's host guard is its own module
    // precisely so a test can import it, and that test has imported it since.
    const pinned = EDGES.find(
      (edge) =>
        edge.importer === "tests/scripts/stage2-capture-host-guard.test.ts" &&
        edge.specifier.endsWith("capture-host-guard.mjs"),
    );
    expect(pinned, `the pinned edge is missing — found instead: ${EDGES.map((e) => e.specifier).join(", ")}`).toBeDefined();
  });

  test("every imported `.mjs` specifier resolves to a file that exists", () => {
    // A specifier left pointing at a moved file is the other way this import breaks,
    // and it fails as a resolution error rather than a parse error.
    const dangling = EDGES.filter((edge) => !existsSync(edge.resolved)).map(
      (edge) => `${edge.importer}:${edge.line} -> ${edge.specifier}`,
    );
    expect(dangling, "these test files import a `.mjs` that does not exist").toEqual([]);
  });

  test("none of them opens with a shebang", () => {
    const shebanged = EDGES.filter((edge) => {
      if (!existsSync(edge.resolved)) return false; // reported by the test above
      return readFileSync(edge.resolved, "utf8").startsWith("#!");
    }).map((edge) => `${edge.importer}:${edge.line} -> ${edge.specifier}`);

    expect(
      shebanged,
      "the SSR transform does not strip a CRLF-terminated `#!` line, so on a Windows checkout the importing " +
        "test file dies with `SyntaxError: Invalid or unexpected token` while Linux CI stays green. Move the " +
        "importable logic into a shebang-free sibling module and leave the shebang on the CLI wrapper " +
        "(see MISTAKES.md).",
    ).toEqual([]);
  });
});
