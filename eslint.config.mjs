import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
