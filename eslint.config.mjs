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

const serviceRoleExceptionListRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only modules enumerated in lib/supabase/service-role-exceptions.ts may reach for the Supabase service-role client.",
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

    const report = (node) =>
      context.report({
        node,
        message:
          "This module reaches for the Supabase service-role client, which bypasses Row Level Security — the tenant boundary. " +
          "Prefer the authenticated client (lib/supabase/server.ts) plus requireCasePermission (lib/cases/). " +
          "If service-role is genuinely unavoidable, add this file to SERVICE_ROLE_EXCEPTIONS in lib/supabase/service-role-exceptions.ts " +
          "with its justification, the case-authorization check that precedes it, and the audit event it emits.",
      });

    const checkSource = (node) => {
      if (node.source && isAdminClientModule(node.source.value)) report(node);
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
        if (node.source?.type === "Literal" && isAdminClientModule(node.source.value)) report(node);
      },
      "CallExpression[callee.name='require']"(node) {
        const [first] = node.arguments;
        if (first?.type === "Literal" && isAdminClientModule(first.value)) report(node);
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
  {
    files: ["lib/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
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
