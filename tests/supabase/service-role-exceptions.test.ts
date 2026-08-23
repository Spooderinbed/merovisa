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
/**
 * The whole first-party tree, matching the ESLint rule's scope. Scanning only
 * `lib` and `app` would let a one-line re-export relay in `components/` or
 * `scripts/` launder the admin client past both fence layers.
 */
const SCANNED_ROOTS = ["lib", "app", "components", "scripts", "docs"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".claude"]);

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
    // ---- The two shapes that used to walk straight through both layers. ----
    // Neither is adversarial evasion; both are what an author reaches for when
    // they do not know lib/supabase/admin.ts exists.
    [
      "an inline client built from the service-role key, importing no admin module",
      `import { createClient } from "@supabase/supabase-js";\nexport const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);\n`,
    ],
    [
      "a bracket-indexed read of the key",
      `export const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];\n`,
    ],
    [
      "a backtick-indexed read of the key",
      "export const key = process.env[`SUPABASE_SERVICE_ROLE_KEY`];\n",
    ],
    [
      "a destructured read of the key",
      `const { SUPABASE_SERVICE_ROLE_KEY } = process.env;\nexport const key = SUPABASE_SERVICE_ROLE_KEY;\n`,
    ],
    [
      "the key passed by name to a helper",
      `declare function readEnv(name: string): string;\nexport const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");\n`,
    ],
    [
      "a template-literal dynamic import",
      "export async function a() { return import(`@/lib/supabase/admin`); }\n",
    ],
    [
      "a template-literal require",
      "const m = require(`@/lib/supabase/admin`);\nexport const a = m;\n",
    ],
    [
      "a template-literal specifier with an interpolated tail",
      "export async function a() { return import(`@/lib/supabase/admin${\"\"}`); }\n",
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

  test("a re-export relay outside lib/ and app/ is flagged at the relay", { timeout: 60_000 }, async () => {
    // The laundering attack: park `export { createSupabaseAdminClient } from
    // "@/lib/supabase/admin"` in components/ or scripts/, then import THAT from a
    // route. The importer's specifier is not an admin-module specifier, so the
    // only place this can be caught is the relay itself — which means the fence
    // has to cover every first-party root, not just the two the layer lives in.
    const relay = `export { createSupabaseAdminClient } from "@/lib/supabase/admin";\n`;
    for (const relayPath of [
      "components/cases/__fence_fixture__.ts",
      "scripts/__fence_fixture__.mjs",
      "docs/__fence_fixture__.js",
      "__fence_fixture__.ts",
    ]) {
      expect(await fenceErrorsFor(relay, relayPath), relayPath).toBeGreaterThan(0);
    }
  });

  test("the registered factory may still read the key it exists to wrap", { timeout: 60_000 }, async () => {
    // lib/supabase/admin.ts is the one module whose whole job is to turn the key
    // into a client. Fencing it would be circular — the rule fences its callers.
    const source = `export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n`;
    expect(await fenceErrorsFor(source, "lib/supabase/admin.ts")).toBe(0);
  });

  test("a similarly-named test-only key is not swept up", { timeout: 60_000 }, async () => {
    // tests/integration/*.itest.ts read SUPABASE_TEST_SERVICE_ROLE_KEY. Matching
    // the key name exactly rather than by substring keeps the fence precise.
    const source = `export const key = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;\n`;
    expect(await fenceErrorsFor(source, UNREGISTERED)).toBe(0);
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

/** Every .ts/.tsx file under the scanned roots. */
function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const absolute = path.join(dir, entry);
    if (statSync(absolute).isDirectory()) {
      collectSourceFiles(absolute, found);
    } else if (/\.(?:tsx?|m?js|cjs)$/.test(entry)) {
      found.push(absolute);
    }
  }
  return found;
}

/**
 * Comments out. Every detector below runs on code only, so a doc comment that
 * *names* the admin client or the key — like the ones in `lib/cases/context.ts`
 * and this very file explaining why they must not be used — is not a finding.
 * Whole-line `//` and `*` continuations plus block comments; a trailing comment
 * on a code line survives, which errs toward a false positive, not a miss.
 * Split on /\r?\n/ — a CRLF checkout otherwise makes every line-filter vacuous.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

/**
 * Does this source REFERENCE the admin module? Matching module specifiers rather
 * than the bare identifier keeps prose out of the results while still catching
 * every aliasing and re-export shape. Backticks are in the quote class because a
 * template-literal specifier — `import(\`@/lib/supabase/admin\`)` — is a module
 * reference like any other, and requiring `["']` let it through.
 */
function referencesAdminModule(code: string): boolean {
  const specifiers = [
    ...code.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["'`]([^"'`]+)["'`]/g),
  ].map((match) => match[1] ?? "");
  return specifiers.some((specifier) => {
    const withoutExtension = specifier.replace(/\.(?:ts|tsx|js|mjs|cjs)$/, "");
    if (/(?:^|\/)supabase\/admin$/.test(withoutExtension)) return true;
    return withoutExtension.startsWith(".") && /(?:^|\/)admin$/.test(withoutExtension);
  });
}

/**
 * Does this source read the service-role key itself? This is the half the
 * specifier match cannot see: an inline
 * `createClient(url, process.env.<the key>)` holds an RLS-bypassing client while
 * importing no admin module at all. The key name is matched EXACTLY, so the
 * integration suite's `SUPABASE_TEST_SERVICE_ROLE_KEY` is not swept up.
 */
function readsServiceRoleKey(code: string): boolean {
  return /\bSUPABASE_SERVICE_ROLE_KEY\b/.test(code);
}

/** The drift sweep's question: does this module hold an RLS-bypassing client? */
export function reachesForServiceRole(source: string): boolean {
  const code = stripComments(source);
  return referencesAdminModule(code) || readsServiceRoleKey(code);
}

describe("B — the registry agrees with the working tree", () => {
  const reachingFiles: string[] = SCANNED_ROOTS.flatMap((root) =>
    collectSourceFiles(path.join(REPO_ROOT, root))
      .filter((absolute) => reachesForServiceRole(readFileSync(absolute, "utf8")))
      .map((absolute) => path.relative(REPO_ROOT, absolute).split(path.sep).join("/")),
  );

  describe("the sweep detects the key, not merely the import", () => {
    const CAUGHT: Array<[string, string]> = [
      ["an inline service-role client", `const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);`],
      ["a bracket-indexed key read", `const k = process.env["SUPABASE_SERVICE_ROLE_KEY"];`],
      ["a destructured key read", `const { SUPABASE_SERVICE_ROLE_KEY } = process.env;`],
      ["a template-literal dynamic import", "await import(`@/lib/supabase/admin`);"],
      ["a template-literal require", "require(`./admin`);"],
      ["a plain import", `import { createSupabaseAdminClient } from "@/lib/supabase/admin";`],
    ];
    for (const [name, source] of CAUGHT) {
      test(`${name} is a finding`, () => {
        expect(reachesForServiceRole(source)).toBe(true);
      });
    }

    const IGNORED: Array<[string, string]> = [
      ["a line comment naming the key", `// never read SUPABASE_SERVICE_ROLE_KEY here`],
      [
        "a doc comment naming the admin module",
        `/**\n * Never import "@/lib/supabase/admin" from this layer.\n */\nexport const a = 1;`,
      ],
      ["the test-only key", `const k = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;`],
      ["the authenticated client", `import { createSupabaseServerClient } from "@/lib/supabase/server";`],
    ];
    for (const [name, source] of IGNORED) {
      test(`${name} is not a finding`, () => {
        expect(reachesForServiceRole(source)).toBe(false);
      });
    }
  });

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

  /**
   * MV-171's review found this entry lying about its own surface: the assess route's
   * `requiredCaseCheck` said "service-role is used for exactly two things — the
   * catalogue read and the assessments INSERT", while line 139 passed the admin
   * client to `caseWriteColumns`, which reads `cases.select("id, student_user_id")`
   * — a TENANT table — through it.
   *
   * Not exploitable, and that is beside the point. This registry is the audit
   * artefact for every RLS bypass in the codebase, so an entry that understates its
   * own surface is the exact failure the list exists to prevent, and a reviewer
   * reading the entry rather than the file gets the wrong answer.
   *
   * PROSE ALONE CANNOT HOLD THIS. The correction was a doc edit, and a doc edit rots
   * the moment somebody adds a fourth use. `caseWriteColumns` / `caseBindColumns` are
   * the two helpers that read `cases` on whatever client they are handed, so a
   * registered path calling either is performing a tenant read the entry must name.
   * That is derivable, so it is asserted rather than remembered.
   */
  test("an entry that derives ownership through service-role SAYS so", () => {
    const OWNERSHIP_HELPERS = ["caseWriteColumns", "caseBindColumns"] as const;

    const silent: string[] = [];
    for (const entry of SERVICE_ROLE_EXCEPTIONS) {
      const absolute = path.join(REPO_ROOT, entry.path);
      if (!existsSync(absolute)) continue;
      const code = stripComments(readFileSync(absolute, "utf8"));
      const used = OWNERSHIP_HELPERS.filter((helper) => code.includes(`${helper}(`));
      if (used.length === 0) continue;

      // The entry may name it anywhere it documents its behaviour.
      const documented = `${entry.justification} ${entry.requiredCaseCheck}`;
      if (!used.some((helper) => documented.includes(helper))) silent.push(entry.path);
    }

    expect(
      silent,
      "these paths read `cases` through the service-role client without naming it in their registry entry",
    ).toEqual([]);
  });

  test("no entry claims a use count it does not keep", () => {
    // The specific sentence that was false. A registry entry counting its own
    // service-role uses is asserting something a reader will not re-derive, and this
    // one had drifted by one for MV-171's whole build.
    const counting = SERVICE_ROLE_EXCEPTIONS.filter((entry) =>
      /\bfor exactly two things\b/.test(`${entry.justification} ${entry.requiredCaseCheck}`),
    ).map((entry) => entry.path);

    // `scripts/stage2/capture-read-path-snapshot.mjs` keeps the phrase legitimately:
    // it enumerates Auth users and reads anonymous rows, and does nothing else.
    expect(counting).toEqual(["scripts/stage2/capture-read-path-snapshot.mjs"]);
  });

  test("the new case-permission layer reaches for service-role nowhere", () => {
    const caseLayer = collectSourceFiles(path.join(REPO_ROOT, "lib", "cases"));
    expect(caseLayer.length).toBeGreaterThan(0);
    for (const absolute of caseLayer) {
      expect(reachesForServiceRole(readFileSync(absolute, "utf8")), absolute).toBe(false);
    }
  });
});

describe("C — the effective lint config IS the registry", () => {
  test("the rule is switched on for lib and app", { timeout: 60_000 }, async () => {
    // components/ and scripts/ are included deliberately: scoping the fence to
    // lib/ + app/ alone let a one-line re-export relay outside those two roots
    // launder the admin client past both layers.
    for (const probe of [
      "lib/cases/permissions.ts",
      "app/api/leads/route.ts",
      "components/chrome/site-header.tsx",
      "scripts/contrast-check.mjs",
    ]) {
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

  test("both fence layers are looking for the key the factory actually reads", () => {
    // The ESLint rule extracts the name from lib/supabase/admin.ts; the sweep
    // above hardcodes it. Renaming the env var without updating both would leave
    // one layer watching for a string that no longer exists — a fence that has
    // quietly stopped fencing. This is the assertion that fails first.
    const factory = readFileSync(path.join(REPO_ROOT, "lib/supabase/admin.ts"), "utf8");
    const named = factory.match(/process\.env\.([A-Z0-9_]*SERVICE_ROLE_KEY)\b/)?.[1];
    expect(named, "lib/supabase/admin.ts no longer reads a *SERVICE_ROLE_KEY env var").toBeDefined();
    expect(reachesForServiceRole(`const k = process.env.${named};`)).toBe(true);
  });

  test("the Motion v2 ADR fence still applies — the new rule did not clobber it", { timeout: 60_000 }, async () => {
    // Flat config REPLACES rule options rather than merging them; a second
    // `no-restricted-imports` block would have silently killed this.
    const config = await eslint.calculateConfigForFile(path.join(REPO_ROOT, "lib/cases/permissions.ts"));
    expect(JSON.stringify(config.rules?.["no-restricted-imports"])).toContain("framer-motion");
  });
});

describe("D — the registry's prose is checked against the source it describes", () => {
  /**
   * A registry is only worth having if a reviewer can trust its prose without
   * re-reading every file. The pre-review draft of this registry claimed the
   * claim route verified an HMAC token (it does not) and that the dev sign-in
   * route was gated on a dev secret and a local-looking URL (neither is true).
   * Both were caught by reading the source. These tests are that read, automated
   * for the one entry whose gates are security-load-bearing.
   */
  const entryFor = (file: string) => {
    const entry = SERVICE_ROLE_EXCEPTIONS.find((candidate) => candidate.path === file);
    expect(entry, `${file} should be registered`).toBeDefined();
    return `${entry!.justification} ${entry!.requiredCaseCheck}`;
  };

  const DEV_SIGN_IN = "app/api/dev/sign-in/route.ts";
  const devSignInSource = readFileSync(path.join(REPO_ROOT, DEV_SIGN_IN), "utf8");

  test("the dev sign-in route's real gates are NODE_ENV and ENABLE_DEV_SIGNIN", () => {
    expect(devSignInSource).toContain("NODE_ENV");
    expect(devSignInSource).toContain("ENABLE_DEV_SIGNIN");
    const prose = entryFor(DEV_SIGN_IN);
    expect(prose, "the entry must name both real gates").toContain("NODE_ENV");
    expect(prose).toContain("ENABLE_DEV_SIGNIN");
  });

  test("the entry says outright that there is no dev secret, because there is not", () => {
    // The pre-review prose read "its dev secret matches". The route reads no
    // secret at all — its only env inputs are the two gates plus DEV_USER_EMAIL.
    // If one is ever added, this fails and the prose gets to be true again.
    expect(/secret/i.test(devSignInSource), "route now checks a secret — update the entry").toBe(false);
    expect(entryFor(DEV_SIGN_IN)).toMatch(/no dev secret/i);
  });

  test("the entry records that the URL check is not a gate while the route still ships it", () => {
    // ensureDevAllowed's second alternative is /\.supabase\.co/, which matches
    // EVERY hosted project including production. Describing that as "the URL must
    // look local" reads as a third gate; it is not one. If the route is ever
    // tightened, this fails in the other direction and the caveat comes out.
    const permitsAnyHostedProject = /supabase\\?\.co/.test(devSignInSource);
    expect(permitsAnyHostedProject, "route no longer permits any *.supabase.co host").toBe(true);
    expect(entryFor(DEV_SIGN_IN), "the entry must not present the URL check as a gate").toContain(
      "supabase.co",
    );
  });

  test("the stage2 capture script's entry describes a host guard the script actually has", () => {
    // MV-164. This entry is the one whose "rehearsal-only" claim used to rest
    // entirely on prose — in this registry, in the script's header and in the
    // runbook — while nothing in the code refused a production URL. The entry now
    // claims a guard; this is the read that keeps the claim true.
    const CAPTURE = "scripts/stage2/capture-read-path-snapshot.mjs";
    const captureSource = readFileSync(path.join(REPO_ROOT, CAPTURE), "utf8");
    const guardSource = readFileSync(path.join(REPO_ROOT, "scripts/stage2/capture-host-guard.mjs"), "utf8");

    const guardAt = captureSource.indexOf("assertCaptureHostAllowed(url");
    const listAt = captureSource.indexOf("auth.admin.listUsers");
    expect(guardAt, "the entry claims a guard runs — the script does not call one").toBeGreaterThan(-1);
    expect(listAt, "the script no longer enumerates users — re-read this entry").toBeGreaterThan(-1);
    expect(guardAt, "the guard must run BEFORE the Auth-user enumeration it exists to prevent").toBeLessThan(listAt);
    expect(guardSource, "the guard must pin the production ref by name").toContain(
      'PRODUCTION_PROJECT_REF = "obfvrxixtautamflzxzq"',
    );

    const prose = entryFor(CAPTURE);
    expect(prose, "the entry must name the ref it refuses").toContain("obfvrxixtautamflzxzq");
    expect(prose, "the entry must name the opt-in for a non-local rehearsal host").toContain("--rehearsal-host");
  });

  test("the claim route's entry still says it verifies no token", () => {
    // The other lying entry the pre-PR review caught. lib/auth/finish-sign-in.ts
    // is the path that calls verifyClaim; the claim route does not.
    const claimRoute = readFileSync(path.join(REPO_ROOT, "app/api/assess/claim/route.ts"), "utf8");
    expect(/verifyClaim/.test(claimRoute), "claim route now verifies a token — update the entry").toBe(false);
    expect(readFileSync(path.join(REPO_ROOT, "lib/auth/finish-sign-in.ts"), "utf8")).toContain("verifyClaim");
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

  /**
   * MV-189 REPLACED a test here, and the replacement is a considered change rather than a
   * failing assertion quietly deleted.
   *
   * It used to read "no Stage-1 entry claims to be emitting an audit event yet", and its
   * stated reason was that `private.write_audit_event` had EXECUTE revoked "until MV-152's
   * grant review". Both halves went stale: MV-152 shipped and deliberately granted no
   * EXECUTE, and the premise underneath — that a GRANT was the blocker — turned out to be
   * false. `private` is not an exposed PostgREST schema, so even with EXECUTE granted to
   * `service_role` the function answers `404 PGRST202`. The write was always going to be a
   * direct INSERT on the service-role client, which is the mechanism MV-152's own migration
   * wrote down (`20260730180000:750-753`). Spec §8.1, D11.
   *
   * So the old test pinned "nothing is audited" as though it were a database constraint,
   * when it was really a description of unfinished work. The three below pin what is now
   * true, and the last keeps the fence: an entry cannot quietly start or stop claiming an
   * audit event without a reviewer seeing the count move.
   */
  test("exactly the five document-access paths and the two invitation paths emit an audit event", () => {
    const wired = SERVICE_ROLE_EXCEPTIONS.filter((entry) => entry.auditEvent !== null).map(
      (entry) => entry.path,
    );
    expect([...wired].sort()).toEqual(
      [
        "app/api/cases/[caseId]/document-requests/[requestId]/versions/route.ts",
        "app/api/cases/[caseId]/document-versions/[versionId]/download/route.ts",
        "app/api/documents/[id]/route.ts",
        "app/api/documents/[id]/view/route.ts",
        "app/api/documents/upload/route.ts",
        // MV-193 — Stage 5 slice 1, and a DIFFERENT shape from the five above: these two
        // reach for service-role to write `audit_events` and nothing else. The invitation
        // row is written on the authenticated client through `invitations_insert_staff`.
        "app/api/cases/[caseId]/invitations/route.ts",
        "app/api/cases/[caseId]/invitations/[invitationId]/route.ts",
      ].sort(),
    );
  });

  test("every emitted action is dotted, past-tense and noun-first", () => {
    for (const entry of SERVICE_ROLE_EXCEPTIONS) {
      if (entry.auditEvent === null) continue;
      expect(entry.auditEvent, entry.path).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  test("the remaining thirteen entries stay null — Stage 6's scope, not Stage 4's", () => {
    // A `null` still means "this path performs no case-scoped DOCUMENT access", and still
    // never means "auditing was skipped". If this number moves, either a path was wired
    // (say so on the card) or one was added without being audited (a finding).
    const unwired = SERVICE_ROLE_EXCEPTIONS.filter((entry) => entry.auditEvent === null);
    expect(unwired).toHaveLength(13);
  });
});
