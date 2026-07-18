// tests/marketing/trust-page-claims.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// MV-122 (audit C-1c): /trust told students their uploaded documents are
// "used only to replace declared values with verified ones in your assessment."
// That is false. reScoreAssessment runs only from /api/assess,
// /api/assess/refresh and /api/profile/section — never from the upload route,
// so uploading a document changes no verdict. Commit fc380e2 already corrected
// this exact claim on the accuracy meter and missed the trust page, leaving the
// codebase asserting both the true and the false version of the same fact. This
// guards the honest wording so the two surfaces cannot drift apart again.
const src = readFileSync(join(process.cwd(), "app/(marketing)/trust/page.tsx"), "utf8");

describe("MV-122 — /trust does not claim uploads feed the assessment", () => {
  it("drops the false 'replace declared values with verified ones' claim", () => {
    expect(src).not.toMatch(/replace declared values with verified ones/i);
  });

  it("states plainly that uploads do not change the verdict", () => {
    expect(src).toMatch(/do not change your verdict/i);
  });
});
