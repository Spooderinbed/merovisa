import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// MV-151 — service-role exception list, machine-enforced.
//
// The service-role key bypasses RLS, and RLS as the authenticated user is the
// tenant boundary. `lib/supabase/service-role-exceptions.ts` is the reviewed
// inventory of modules allowed to construct that client; this rule is what makes
// the inventory binding instead of aspirational (plan lines 340-344).
//
// The allow-list is EXTRACTED from the registry module rather than restated here,
// so there is exactly one list a reviewer has to trust. Extraction is fail-closed:
// an empty result throws at config load, which fails `npm run lint` loudly rather
// than silently permitting every call site.
// ---------------------------------------------------------------------------
const serviceRoleExceptionPaths = (() => {
  const registry = "lib/supabase/service-role-exceptions.ts";
  const source = readFileSync(path.join(repoRoot, registry), "utf8");
  const paths = [...source.matchAll(/^\s*path:\s*"([^"]+)",\s*$/gm)].map((match) => match[1]);
  if (paths.length === 0) {
    throw new Error(
      `[eslint] Could not extract any service-role exception paths from ${registry}. ` +
        "Refusing to run with an empty allow-list — that would silently unfence every call site.",
    );
  }
  return paths;
})();

/**
 * The env var that IS the RLS bypass, READ OUT OF the factory that wraps it
 * rather than restated here — the same "one list a reviewer must trust" reasoning
 * as the allow-list above, and it means this config never contains the literal
 * the rule fences (a rule that flagged its own definition would be unshippable).
 * Rename the var in `lib/supabase/admin.ts` and the fence follows; remove it and
 * config load throws, failing lint loudly instead of fencing nothing.
 *
 * Matched exactly downstream, so the integration suite's differently-prefixed
 * test key is not swept up with it.
 */
const serviceRoleKeyEnv = (() => {
  const factory = "lib/supabase/admin.ts";
  const source = readFileSync(path.join(repoRoot, factory), "utf8");
  const match = source.match(/process\.env\.([A-Z0-9_]*SERVICE_ROLE_KEY)\b/);
  if (!match) {
    throw new Error(
      `[eslint] Could not find the service-role key env var in ${factory}. ` +
        "Refusing to run: the fence would silently stop detecting inline service-role clients.",
    );
  }
  return match[1];
})();

/**
 * True for any module specifier that resolves to `lib/supabase/admin`. Relative
 * specifiers ending in `admin` count too: `lib/supabase/admin.ts` is the only
 * `admin*` module in the tree, so treating `./admin` as a hit is fail-closed, and
 * a future unrelated `./admin` gets a clear message rather than a silent pass.
 */
function isAdminClientModule(specifier) {
  if (typeof specifier !== "string") return false;
  const withoutExtension = specifier.replace(/\.(?:ts|tsx|js|mjs|cjs)$/, "");
  if (/(?:^|\/)supabase\/admin$/.test(withoutExtension)) return true;
  return withoutExtension.startsWith(".") && /(?:^|\/)admin$/.test(withoutExtension);
}

/**
 * The specifier of an import/require node, whatever syntax carries it. A
 * TEMPLATE literal is a module specifier like any other — `import(\`./admin\`)`
 * — and testing only `node.type === "Literal"` let that shape through. For a
 * template with interpolations the static parts are tested both joined and
 * individually, so a hit anywhere in the static text is a hit.
 */
function isAdminClientSpecifier(node) {
  if (!node) return false;
  if (node.type === "TemplateLiteral") {
    const parts = node.quasis.map((quasi) => quasi.value.cooked ?? "");
    return isAdminClientModule(parts.join("")) || parts.some(isAdminClientModule);
  }
  return node.type === "Literal" && isAdminClientModule(node.value);
}

const serviceRoleExceptionListRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only modules enumerated in lib/supabase/service-role-exceptions.ts may hold the Supabase service-role client — whether by importing lib/supabase/admin or by reading the service-role key directly.",
    },
    schema: [
      {
        type: "object",
        properties: { allow: { type: "array", items: { type: "string" } } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const allow = new Set(context.options[0]?.allow ?? []);
    // Exact path comparison, never a glob: real route paths contain `[id]` and
    // `(focused)`, which a minimatch pattern would read as a character class and
    // an extglob group.
    const relative = path.relative(context.cwd, context.filename).split(path.sep).join("/");
    if (allow.has(relative)) return {};

    const REMEDY =
      "Prefer the authenticated client (lib/supabase/server.ts) plus requireCasePermission (lib/cases/). " +
      "If service-role is genuinely unavoidable, add this file to SERVICE_ROLE_EXCEPTIONS in lib/supabase/service-role-exceptions.ts " +
      "with its justification, the case-authorization check that precedes it, and the audit event it emits.";

    const reportModule = (node) =>
      context.report({
        node,
        message:
          "This module reaches for the Supabase service-role client, which bypasses Row Level Security — the tenant boundary. " +
          REMEDY,
      });

    // The half a specifier match cannot see. An inline
    // `createClient(url, process.env.<key>)` holds exactly the same RLS-bypassing
    // client while importing no admin module at all — and it is what an author
    // who does not know lib/supabase/admin.ts exists reaches for. Matching the
    // KEY rather than the import path is what makes the registry the real fence.
    const reportKey = (node) =>
      context.report({
        node,
        message:
          `This module reads ${serviceRoleKeyEnv} directly. That key bypasses Row Level Security — the tenant ` +
          "boundary — so a client built from it is a service-role client no matter which module constructed it. " +
          REMEDY,
      });

    const checkSource = (node) => {
      if (node.source && isAdminClientSpecifier(node.source)) reportModule(node);
    };

    return {
      // Covers aliased (`as x`) and namespace (`* as admin`) imports too: both are
      // the same ImportDeclaration, and the specifier is what we match on.
      ImportDeclaration: checkSource,
      // `export { createSupabaseAdminClient } from "..."` — a re-export is how a
      // fence gets laundered, so it is flagged at the re-exporting module.
      ExportNamedDeclaration: checkSource,
      ExportAllDeclaration: checkSource,
      ImportExpression(node) {
        if (isAdminClientSpecifier(node.source)) reportModule(node);
      },
      "CallExpression[callee.name='require']"(node) {
        if (isAdminClientSpecifier(node.arguments[0])) reportModule(node);
      },
      // Every syntax that can name the key resolves to one of these three nodes:
      // `process.env.KEY` and `const { KEY } = process.env` are Identifiers,
      // `process.env["KEY"]` and `readEnv("KEY")` are Literals, and
      // `process.env[`KEY`]` is a TemplateElement. Comments are not in the AST,
      // so prose naming the key — including this comment — is never a finding.
      Identifier(node) {
        if (node.name === serviceRoleKeyEnv) reportKey(node);
      },
      Literal(node) {
        if (node.value === serviceRoleKeyEnv) reportKey(node);
      },
      TemplateElement(node) {
        if (node.value?.cooked === serviceRoleKeyEnv) reportKey(node);
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Research tooling scripts are standalone CommonJS Node programs — require() is correct there.
  {
    files: ["docs/research-briefs/_tools/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Honour the _-prefix convention for intentionally-unused bindings.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Motion v2 ADR (docs/design/2026-07-03-motion-v2-adr.md §1): motion stays
  // CSS-first — no runtime animation library on the low-end-Android funnel. The
  // narrow escape hatch (one Phase-2 surface) is served by an explicit, reviewed
  // eslint-disable, which is exactly the friction the ADR asks for.
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "framer-motion",
              message:
                "Motion v2 ADR: no JS animation library — motion is CSS-first (opacity/transform keyframes + transitions). See docs/design/2026-07-03-motion-v2-adr.md.",
            },
            {
              name: "gsap",
              message:
                "Motion v2 ADR: no JS animation library — motion is CSS-first. See docs/design/2026-07-03-motion-v2-adr.md.",
            },
          ],
          patterns: [
            {
              group: ["motion", "motion/*"],
              message:
                "Motion v2 ADR: no JS animation library — motion is CSS-first. The narrow escape hatch needs an explicit reviewed eslint-disable. See docs/design/2026-07-03-motion-v2-adr.md.",
            },
          ],
        },
      ],
    },
  },
  // MV-151: the service-role fence. A dedicated rule rather than another
  // `no-restricted-imports` entry on purpose — flat config REPLACES a rule's
  // options rather than merging them, so a second `no-restricted-imports` block
  // would silently disable the Motion v2 ADR fence above for every file it
  // matched. Two concerns, two rules, no interference.
  //
  // Scoped to the whole first-party tree, not just `lib/` and `app/`: a one-line
  // re-export relay parked in `components/` or `scripts/` would otherwise launder
  // the admin client past both this rule and the drift sweep, because the route
  // importing the relay sees a specifier that is not an admin-module specifier.
  // Widening costs nothing — the allow-list is matched by exact path — and it
  // closes the hole at its root: the relay itself is now the flagged module.
  // `tests/**` is exempt: a test may legitimately import the client it is testing.
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    ignores: ["tests/**"],
    plugins: {
      merovisa: { rules: { "service-role-exception-list": serviceRoleExceptionListRule } },
    },
    rules: {
      "merovisa/service-role-exception-list": ["error", { allow: serviceRoleExceptionPaths }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prototype reference code, not production:
    "design-extract/**",
    "claudedesign/**",
    // Agent worktrees (full repo copies) and other harness state:
    ".claude/**",
  ]),
]);

export default eslintConfig;
