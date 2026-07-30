import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ESLint } from "eslint";

import {
  SANCTIONED_SERVICE_ROLE_CATEGORIES,
  SERVICE_ROLE_EXCEPTIONS,
  SERVICE_ROLE_EXCEPTION_PATHS,
} from "@/lib/supabase/service-role-exceptions";

/**
 * MV-151 — the service-role fence, proven three independent ways:
 *
 *  A. the real ESLint rule fires on every evasion shape (aliased import,
 *     namespace import, re-export, `export *`, dynamic import, require, relative
 *     specifier) and stays silent for a registered path;
 *  B. the working tree agrees with the registry — no unregistered module reaches
 *     for the admin client, and no registry entry points at a file that does not;
 *  C. the effective ESLint config's allow-list IS the registry, so the rule
 *     cannot drift into permitting something the reviewed inventory does not.
 *
 * A documented list alone is a convention the next PR forgets. These are what
 * make it binding (card: "The exception list is machine-enforced").
 */

const REPO_ROOT = process.cwd();
const RULE = "merovisa/service-role-exception-list";
const SCANNED_ROOTS = ["lib", "app"];

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: REPO_ROOT });
}, 60_000);

/** How many times our rule fired on this source, linted as `filePath`. */
async function fenceErrorsFor(source: string, filePath: string): Promise<number> {
  const results = await eslint.lintText(source, { filePath: path.join(REPO_ROOT, filePath) });
  return results
    .flatMap((result) => result.messages)
    .filter((message) => message.ruleId === RULE).length;
}

describe("A — the ESLint rule fires on every evasion shape", () => {
  const UNREGISTERED = "lib/cases/__fence_fixture__.ts";

  const EVASIONS: Array<[name: string, source: string, filePath?: string]> = [
    ["a plain import", `import { createSupabaseAdminClient } from "@/lib/supabase/admin";\nexport const a = createSupabaseAdminClient;\n`],
    ["an aliased import", `import { createSupabaseAdminClient as quiet } from "@/lib/supabase/admin";\nexport const a = quiet;\n`],
    ["a namespace import", `import * as adminMod from "@/lib/supabase/admin";\nexport const a = adminMod;\n`],
    ["a named re-export", `export { createSupabaseAdminClient } from "@/lib/supabase/admin";\n`],
    ["a renamed re-export", `export { createSupabaseAdminClient as make } from "@/lib/supabase/admin";\n`],
    ["a star re-export", `export * from "@/lib/supabase/admin";\n`],
    ["a side-effect import", `import "@/lib/supabase/admin";\n`],
    ["a dynamic import", `export async function a() { return import("@/lib/supabase/admin"); }\n`],
    ["a require call", `const m = require("@/lib/supabase/admin");\nexport const a = m;\n`],
    [
      "a relative specifier from inside lib/supabase",
      `import { createSupabaseAdminClient } from "./admin";\nexport const a = createSupabaseAdminClient;\n`,
      "lib/supabase/__fence_fixture__.ts",
    ],
    [
      "an extensioned specifier",
      `import { createSupabaseAdminClient } from "@/lib/supabase/admin.ts";\nexport const a = createSupabaseAdminClient;\n`,
    ],
  ];

  for (const [name, source, filePath] of EVASIONS) {
    test(`${name} in an unregistered module is an error`, { timeout: 60_000 }, async () => {
      expect(await fenceErrorsFor(source, filePath ?? UNREGISTERED)).toBeGreaterThan(0);
    });
  }

  test("a registered call site passes", { timeout: 60_000 }, async () => {
    const source = `import { createSupabaseAdminClient } from "@/lib/supabase/admin";\nexport const a = createSupabaseAdminClient;\n`;
    expect(await fenceErrorsFor(source, "app/api/leads/route.ts")).toBe(0);
  });

  test("every registered path is genuinely exempt, not just the one we spot-checked", { timeout: 120_000 }, async () => {
    const source = `import { createSupabaseAdminClient } from "@/lib/supabase/admin";\nexport const a = createSupabaseAdminClient;\n`;
    for (const registered of SERVICE_ROLE_EXCEPTION_PATHS) {
      expect(await fenceErrorsFor(source, registered), `${registered} should be exempt`).toBe(0);
    }
  });

  test("the authenticated client is never fenced — it is the encouraged path", { timeout: 60_000 }, async () => {
    const source = `import { createSupabaseServerClient } from "@/lib/supabase/server";\nexport const a = createSupabaseServerClient;\n`;
    expect(await fenceErrorsFor(source, UNREGISTERED)).toBe(0);
  });

  test("an unrelated module named admin elsewhere is still fenced (fail-closed)", { timeout: 60_000 }, async () => {
    // lib/supabase/admin.ts is the only admin* module in the tree, so a relative
    // `./admin` is treated as a hit. Erring toward a false positive is correct
    // here: the author gets a clear message instead of a silent bypass.
    const source = `import x from "./admin";\nexport const a = x;\n`;
    expect(await fenceErrorsFor(source, "app/api/__fence_fixture__/route.ts")).toBeGreaterThan(0);
  });
});

describe("B — the registry agrees with the working tree", () => {
  /** Every .ts/.tsx file under the scanned roots. */
  function collectSourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const absolute = path.join(dir, entry);
      if (statSync(absolute).isDirectory()) {
        collectSourceFiles(absolute, found);
      } else if (/\.tsx?$/.test(entry)) {
        found.push(absolute);
      }
    }
    return found;
  }

  /**
   * Does this source REFERENCE the admin module (as opposed to merely mentioning
   * the identifier in prose)? Matching module specifiers rather than the bare
   * name keeps doc comments that name `createSupabaseAdminClient` — like the one
   * in lib/cases/context.ts explaining why it must never be used — out of the
   * results, while still catching every aliasing and re-export shape.
   */
  function referencesAdminModule(source: string): boolean {
    const specifiers = [
      ...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g),
    ].map((match) => match[1] ?? "");
    return specifiers.some((specifier) => {
      const withoutExtension = specifier.replace(/\.(?:ts|tsx|js|mjs|cjs)$/, "");
      if (/(?:^|\/)supabase\/admin$/.test(withoutExtension)) return true;
      return withoutExtension.startsWith(".") && /(?:^|\/)admin$/.test(withoutExtension);
    });
  }

  const reachingFiles: string[] = SCANNED_ROOTS.flatMap((root) =>
    collectSourceFiles(path.join(REPO_ROOT, root))
      .filter((absolute) => referencesAdminModule(readFileSync(absolute, "utf8")))
      .map((absolute) => path.relative(REPO_ROOT, absolute).split(path.sep).join("/")),
  );

  test("the sweep found the call sites at all — a silent zero would pass vacuously", () => {
    expect(reachingFiles.length).toBeGreaterThan(5);
  });

  test("every module reaching for the service-role client is registered", () => {
    const registered = new Set(SERVICE_ROLE_EXCEPTION_PATHS);
    const unregistered = reachingFiles.filter((file) => !registered.has(file));
    expect(unregistered, "add these to SERVICE_ROLE_EXCEPTIONS with a justification").toEqual([]);
  });

  test("no registry entry points at a file that does not exist", () => {
    const missing = SERVICE_ROLE_EXCEPTION_PATHS.filter(
      (file) => !existsSync(path.join(REPO_ROOT, file)),
    );
    expect(missing, "stale entries widen the fence for nothing").toEqual([]);
  });

  test("no registry entry is stale — each still reaches for the client", () => {
    const reaching = new Set(reachingFiles);
    const stale = SERVICE_ROLE_EXCEPTIONS.filter(
      // The factory module defines the client rather than importing it.
      (entry) => entry.status !== "client-definition" && !reaching.has(entry.path),
    ).map((entry) => entry.path);
    expect(stale, "this path no longer uses service-role — remove its exception").toEqual([]);
  });

  test("the new case-permission layer reaches for service-role nowhere", () => {
    const caseLayer = collectSourceFiles(path.join(REPO_ROOT, "lib", "cases"));
    expect(caseLayer.length).toBeGreaterThan(0);
    for (const absolute of caseLayer) {
      expect(referencesAdminModule(readFileSync(absolute, "utf8")), absolute).toBe(false);
    }
  });
});

describe("C — the effective lint config IS the registry", () => {
  test("the rule is switched on for lib and app", { timeout: 60_000 }, async () => {
    for (const probe of ["lib/cases/permissions.ts", "app/api/leads/route.ts"]) {
      const config = await eslint.calculateConfigForFile(path.join(REPO_ROOT, probe));
      const entry = config.rules?.[RULE];
      expect(entry, `${RULE} should be configured for ${probe}`).toBeDefined();
      // calculateConfigForFile normalises severity to its numeric form (2 = error).
      const severity = Array.isArray(entry) ? entry[0] : entry;
      expect(severity === "error" || severity === 2, `${probe} severity: ${String(severity)}`).toBe(true);
    }
  });

  test("the allow-list the rule runs with is exactly the registry", { timeout: 60_000 }, async () => {
    const config = await eslint.calculateConfigForFile(path.join(REPO_ROOT, "lib/cases/permissions.ts"));
    const entry = config.rules?.[RULE] as [unknown, { allow?: string[] }] | undefined;
    expect(entry?.[1]?.allow).toEqual([...SERVICE_ROLE_EXCEPTION_PATHS]);
  });

  test("the Motion v2 ADR fence still applies — the new rule did not clobber it", { timeout: 60_000 }, async () => {
    // Flat config REPLACES rule options rather than merging them; a second
    // `no-restricted-imports` block would have silently killed this.
    const config = await eslint.calculateConfigForFile(path.join(REPO_ROOT, "lib/cases/permissions.ts"));
    expect(JSON.stringify(config.rules?.["no-restricted-imports"])).toContain("framer-motion");
  });
});

describe("registry hygiene", () => {
  test("no duplicate paths", () => {
    expect(new Set(SERVICE_ROLE_EXCEPTION_PATHS).size).toBe(SERVICE_ROLE_EXCEPTION_PATHS.length);
  });

  test("every entry carries a justification and a stated pre-condition", () => {
    for (const entry of SERVICE_ROLE_EXCEPTIONS) {
      expect(entry.justification.length, entry.path).toBeGreaterThan(30);
      expect(entry.requiredCaseCheck.length, entry.path).toBeGreaterThan(10);
      expect(entry.path.includes("\\"), `${entry.path} must use forward slashes`).toBe(false);
    }
  });

  test("paths are repo-relative, not absolute", () => {
    for (const entry of SERVICE_ROLE_EXCEPTIONS) {
      expect(path.isAbsolute(entry.path), entry.path).toBe(false);
    }
  });

  test("the plan's four sanctioned categories are recorded with a check and an audit event", () => {
    expect(SANCTIONED_SERVICE_ROLE_CATEGORIES.map((entry) => entry.category)).toEqual([
      "invitation acceptance",
      "account linking",
      "storage administration",
      "deletion jobs",
    ]);
    for (const entry of SANCTIONED_SERVICE_ROLE_CATEGORIES) {
      expect(entry.auditEvent.length, entry.category).toBeGreaterThan(0);
      expect(entry.requiredCaseCheck.length, entry.category).toBeGreaterThan(10);
    }
  });

  test("no Stage-1 entry claims to be emitting an audit event yet", () => {
    // MV-150 shipped private.write_audit_event with EXECUTE revoked, so nothing
    // can emit one until MV-152's grant review. A non-null value here would be a
    // claim the database cannot honour.
    for (const entry of SERVICE_ROLE_EXCEPTIONS) {
      expect(entry.auditEvent, entry.path).toBeNull();
    }
  });
});
