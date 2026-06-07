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
  ]),
]);

export default eslintConfig;
