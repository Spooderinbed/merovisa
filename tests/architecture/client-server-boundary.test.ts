import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * No `"use client"` module may reach a `server-only` module, directly or through
 * any chain of first-party imports.
 *
 * ## Why this exists
 *
 * MV-169 shipped a client component that imported `MEMBERSHIP_ROLES` from
 * `lib/cases/permissions.ts` — a `server-only` module whose own doc-comment says
 * *"permission rules are server business logic and must never be readable in
 * client JS"*, the same reasoning that keeps the scoring engine server-side
 * (CLAUDE.md §Architecture Rules). That import would have compiled the entire
 * role→permission matrix into the browser bundle.
 *
 * **The whole test suite stayed green.** Every suite that touches these modules
 * does `vi.mock("server-only", () => ({}))` — the established repo idiom — so in
 * jsdom the marker simply is not there. Only `next build` failed, and only because
 * someone ran it. This test moves that signal into `npm test`, where it is the
 * gate rather than an afterthought.
 *
 * ## What it checks, and what it deliberately does not
 *
 * It walks first-party imports (`@/…` and relative) transitively from each
 * `"use client"` entry point. It does NOT resolve `node_modules`: a third-party
 * package importing `server-only` is that package's business and Next's bundler
 * reports it anyway.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE_DIRS = ["app", "components", "lib"];
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // Agent worktrees under .claude/ are full repo copies — never scan them.
    if (entry === "node_modules" || entry === ".claude" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(full))) out.push(full);
  }
  return out;
}

const FILES = SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir)));
// CRLF working tree on Windows: splitting on "\n" leaves a trailing "\r" on every
// line, so a `"use client"` directive stops matching and the whole suite passes
// vacuously — green on Linux CI, and green here for the wrong reason.
const read = (file: string) => readFileSync(file, "utf8").split(/\r?\n/);

function isClientModule(lines: string[]): boolean {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) {
      continue;
    }
    return /^["']use client["'];?$/.test(trimmed);
  }
  return false;
}

function isServerOnlyModule(lines: string[]): boolean {
  return lines.some((line) => /^import\s+["']server-only["'];?\s*$/.test(line.trim()));
}

/** First-party import specifiers only — `@/…` and relative. */
function importsOf(lines: string[]): string[] {
  const specifiers: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:import|export)\b[^"']*from\s+["']([^"']+)["']/);
    if (match?.[1]) specifiers.push(match[1]);
  }
  return specifiers.filter((s) => s.startsWith("@/") || s.startsWith("."));
}

// Resolution is a Set lookup over the files `walk` already found, not a `statSync`
// per candidate. On this OneDrive-backed checkout a stat is slow enough that the
// per-candidate version issued thousands of them and pushed neighbouring
// file-scanning suites past their 5s timeout under parallel load.
const KNOWN_FILES = new Set(FILES);

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.join(ROOT, specifier.slice(2))
    : path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [
    ...EXTENSIONS.map((ext) => base + ext),
    ...EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
  ]) {
    if (KNOWN_FILES.has(candidate)) return candidate;
  }
  return null;
}

const linesCache = new Map<string, string[]>();
function linesOf(file: string): string[] {
  const cached = linesCache.get(file);
  if (cached) return cached;
  const lines = read(file);
  linesCache.set(file, lines);
  return lines;
}

/** The import chain from a client entry point to a server-only module, if one exists. */
function findServerOnlyChain(entry: string): string[] | null {
  const seen = new Set<string>([entry]);
  const queue: Array<{ file: string; chain: string[] }> = [{ file: entry, chain: [entry] }];

  while (queue.length > 0) {
    const { file, chain } = queue.shift() as { file: string; chain: string[] };
    for (const specifier of importsOf(linesOf(file))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null || seen.has(resolved)) continue;
      seen.add(resolved);
      const next = [...chain, resolved];
      if (isServerOnlyModule(linesOf(resolved))) return next;
      queue.push({ file: resolved, chain: next });
    }
  }
  return null;
}

const CLIENT_MODULES = FILES.filter((file) => isClientModule(linesOf(file)));

describe("the client/server boundary", () => {
  it("finds client modules and server-only modules — the scan is not vacuous", () => {
    // Without this, a broken glob or a CRLF slip turns every assertion below into
    // a pass over an empty list.
    expect(CLIENT_MODULES.length).toBeGreaterThan(10);
    expect(FILES.filter((file) => isServerOnlyModule(linesOf(file))).length).toBeGreaterThan(5);
  });

  it("no 'use client' module reaches a server-only module", () => {
    const violations = CLIENT_MODULES.map((entry) => ({ entry, chain: findServerOnlyChain(entry) }))
      .filter((result) => result.chain !== null)
      .map(({ chain }) => (chain as string[]).map((f) => path.relative(ROOT, f)).join("\n    → "));

    expect(violations).toEqual([]);
  });
});
