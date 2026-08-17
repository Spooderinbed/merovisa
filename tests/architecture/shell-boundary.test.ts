import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The signed-in area has TWO shells, and neither may wear the other's chrome.
 *
 * ## Why this exists
 *
 * Before MV-180 there was one `app/(app)/layout.tsx`, so consultancy staff
 * processing cases were described as students by their own chrome: the journey
 * marker ("your next step"), a "My plan" nav item, and the five student mobile
 * tabs all rendered inside `/workspace`. The fix splits the shell — a neutral
 * authenticated layout, a `(student)` route group, and the `workspace` segment —
 * without changing a single public URL.
 *
 * ## Why a source scan and not just a render test
 *
 * The render tests in `tests/app/shell-split.test.tsx` prove what the two layouts
 * compose TODAY. They cannot see a chrome component added three levels down a
 * nested route six months from now, because nothing renders that route in jsdom.
 * This scan can, and it is the direction that regresses silently: a page that
 * imports `MobileTabBar` for a "quick nav" puts student tabs back on a case.
 *
 * It checks DIRECT imports only. A chrome component reached transitively through a
 * panel would also be a violation, but resolving the graph is
 * `client-server-boundary.test.ts`'s job and this file stays cheap on purpose.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const APP_GROUP = path.join(ROOT, "app", "(app)");
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".claude" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(full))) out.push(full);
  }
  return out;
}

/** Repo-relative, forward-slashed — the form the assertion messages should read in. */
function rel(file: string): string {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

// CRLF working tree on Windows: `split("\n")` leaves a trailing "\r" on every line
// and an anchored pattern stops matching, so the whole scan passes vacuously —
// green on Linux CI and green here for the wrong reason (MISTAKES.md: testing).
function importedModules(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const found: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*import\s[^"']*["']([^"']+)["']/);
    if (match) found.push(match[1]!);
  }
  return found;
}

/** The chrome that says "you are a student, and this is your journey". */
const STUDENT_CHROME = [
  "@/components/layout/app-bar",
  "@/components/layout/footer",
  "@/components/layout/mobile-tab-bar",
  "@/components/journey/journey-marker",
];

/** The chrome that says "you are staff, inside one consultancy". */
const CONSULTANCY_CHROME = [
  "@/components/workspace/workspace-top-bar",
  "@/components/workspace/org-rail",
];

const FILES = walk(APP_GROUP);

const STUDENT_FILES = FILES.filter((f) => rel(f).startsWith("app/(app)/(student)/"));
const WORKSPACE_FILES = FILES.filter((f) => rel(f).startsWith("app/(app)/workspace/"));
/** The layout, `error.tsx` and `loading.tsx` — shared by both shells, so neutral. */
const NEUTRAL_FILES = FILES.filter(
  (f) => !STUDENT_FILES.includes(f) && !WORKSPACE_FILES.includes(f),
);

function violations(files: string[], banned: string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    for (const specifier of importedModules(file)) {
      if (banned.includes(specifier)) out.push(`${rel(file)} imports ${specifier}`);
    }
  }
  return out;
}

describe("signed-in shell boundary (MV-180)", () => {
  it("finds both shells, so the scan cannot pass by scanning nothing", () => {
    // The guard above every other assertion here: a renamed route group would
    // empty both lists and every "no violations" expectation below would hold
    // vacuously.
    expect(STUDENT_FILES.length).toBeGreaterThan(0);
    expect(WORKSPACE_FILES.length).toBeGreaterThan(0);
  });

  it("keeps student chrome out of the consultancy workspace", () => {
    expect(violations(WORKSPACE_FILES, STUDENT_CHROME)).toEqual([]);
  });

  it("keeps consultancy chrome out of the student shell", () => {
    // The other direction, and it is not symmetric decoration: an org rail on a
    // student route would name a consultancy to someone who belongs to none.
    expect(violations(STUDENT_FILES, CONSULTANCY_CHROME)).toEqual([]);
  });

  it("keeps the neutral authenticated layout neutral — it wears neither shell's chrome", () => {
    expect(violations(NEUTRAL_FILES, [...STUDENT_CHROME, ...CONSULTANCY_CHROME])).toEqual([]);
  });

  it("leaves no route stranded outside both shells", () => {
    // A page added directly under `app/(app)/` would inherit the neutral layout
    // and render with NO chrome at all — no nav, no footer, no way out. The three
    // shared files are the only things that may live there.
    const stranded = NEUTRAL_FILES.map(rel).filter(
      (f) => !["app/(app)/layout.tsx", "app/(app)/error.tsx", "app/(app)/loading.tsx"].includes(f),
    );
    expect(stranded).toEqual([]);
  });
});
