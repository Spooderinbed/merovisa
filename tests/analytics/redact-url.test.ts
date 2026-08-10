import { describe, test, expect } from "vitest";
import {
  redactSearchParams,
  sanitizeAnalyticsProperties,
  REDACTION_PLACEHOLDER,
} from "@/lib/analytics/redact-url";

/**
 * The premise the instrumentation spec enabled pageview capture on — *"routes
 * carry no sensitive params"* — stopped being true when MV-170 shipped a GET
 * search form over student names and email addresses. These pin the hook that
 * keeps the term out of PostHog, and the parts of the URL it must NOT touch.
 *
 * Every value below is a placeholder. `cases.display_name`/`email` describe real
 * people from Stage 7 onward and no real row belongs in a test.
 */

const STUDENTS = "https://app.test/workspace/org-1/students";

describe("redactSearchParams", () => {
  test("replaces a searched name, and keeps the parameter so 'a search happened' survives", () => {
    const redacted = redactSearchParams(`${STUDENTS}?q=Placeholder+Name`);
    expect(redacted).not.toContain("Placeholder");
    expect(redacted).toBe(`${STUDENTS}?q=${REDACTION_PLACEHOLDER}`);
  });

  test("replaces a searched email address — the '@' does not make it a different kind of secret", () => {
    expect(redactSearchParams(`${STUDENTS}?q=someone%40example.test`)).toBe(
      `${STUDENTS}?q=${REDACTION_PLACEHOLDER}`,
    );
  });

  test("leaves every other parameter alone, in place — utm attribution is the point of pageviews", () => {
    expect(
      redactSearchParams(`${STUDENTS}?utm_source=email&q=Placeholder&status=closed`),
    ).toBe(`${STUDENTS}?utm_source=email&q=${REDACTION_PLACEHOLDER}&status=closed`);
  });

  test("redacts BOTH slots of a repeated parameter, rather than the first one only", () => {
    expect(redactSearchParams(`${STUDENTS}?q=One&q=Two`)).toBe(
      `${STUDENTS}?q=${REDACTION_PLACEHOLDER}&q=${REDACTION_PLACEHOLDER}`,
    );
  });

  test("keeps the fragment, which is never sent to a server but is sent to PostHog", () => {
    expect(redactSearchParams(`${STUDENTS}?q=Placeholder#results`)).toBe(
      `${STUDENTS}?q=${REDACTION_PLACEHOLDER}#results`,
    );
  });

  test("returns a URL with nothing to redact byte for byte", () => {
    for (const url of [STUDENTS, `${STUDENTS}?status=closed`, "/workspace/org-1/students", ""]) {
      expect(redactSearchParams(url)).toBe(url);
    }
  });

  test("works on a bare path, because $pathname is not an absolute URL", () => {
    expect(redactSearchParams("/workspace/org-1/students?q=Placeholder")).toBe(
      `/workspace/org-1/students?q=${REDACTION_PLACEHOLDER}`,
    );
  });
});

describe("sanitizeAnalyticsProperties", () => {
  test("cleans every URL property, not just the current one", () => {
    // $referrer is the leak that outlives the search page: the pageview for
    // wherever the counsellor navigates NEXT carries the URL they came from.
    const sanitized = sanitizeAnalyticsProperties({
      $current_url: `${STUDENTS}?q=Placeholder`,
      $initial_current_url: `${STUDENTS}?q=Placeholder`,
      $referrer: `${STUDENTS}?q=Placeholder`,
      $initial_referrer: `${STUDENTS}?q=Placeholder`,
      $pathname: "/workspace/org-1/students?q=Placeholder",
    });

    expect(JSON.stringify(sanitized)).not.toContain("Placeholder");
  });

  test("leaves the catalog's own event properties untouched", () => {
    const sanitized = sanitizeAnalyticsProperties({ surface: "matches", domain: "example.test" });
    expect(sanitized).toEqual({ surface: "matches", domain: "example.test" });
  });

  test("does not mutate the object PostHog handed it", () => {
    const original = { $current_url: `${STUDENTS}?q=Placeholder` };
    sanitizeAnalyticsProperties(original);
    expect(original.$current_url).toBe(`${STUDENTS}?q=Placeholder`);
  });

  test("ignores a non-string in a URL slot rather than throwing inside PostHog's hook", () => {
    expect(sanitizeAnalyticsProperties({ $current_url: null })).toEqual({ $current_url: null });
  });
});
