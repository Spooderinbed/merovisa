import { describe, test, expect } from "vitest";
import {
  redactSearchParams,
  redactPathSecrets,
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

/**
 * MV-194 — the invitation token is a PATH SEGMENT, which `redactSearchParams` cannot see.
 *
 * `/invite/<token>` is the one URL in the product that carries a live bearer credential,
 * and `capture_pageview: "history_change"` ships `$current_url` on every navigation. So a
 * student clicking their invitation link would hand PostHog a working invitation — the
 * exact defect hashing `token_hash` in the database exists to prevent, one layer up, and a
 * plain violation of criterion 7 ("the plaintext token appears in NO URL other than the
 * student's own inbound link … and in no client-side log").
 *
 * Redaction rather than switching analytics off for the route, and the reason is that the
 * cheaper fix does not work: `$referrer` and `$session_entry_url` carry the invite URL to
 * every LATER page in the session, so suppressing init on `/invite` alone would leak the
 * token from the dashboard instead. Only cleaning the value closes it.
 */
const INVITE_TOKEN = "Zm9vYmFyLXRva2VuLXZhbHVlLW5vYm9keS1zZWVzLXh4";

describe("redactPathSecrets — MV-194's invitation token", () => {
  test("replaces the token segment of an absolute invite URL", () => {
    expect(redactPathSecrets(`https://app.test/invite/${INVITE_TOKEN}`)).toBe(
      `https://app.test/invite/${REDACTION_PLACEHOLDER}`,
    );
  });

  test("works on a bare path, because $pathname is not an absolute URL", () => {
    expect(redactPathSecrets(`/invite/${INVITE_TOKEN}`)).toBe(`/invite/${REDACTION_PLACEHOLDER}`);
  });

  test("keeps a trailing query and fragment, which posthog also ships", () => {
    expect(redactPathSecrets(`https://app.test/invite/${INVITE_TOKEN}?utm_source=viber#top`)).toBe(
      `https://app.test/invite/${REDACTION_PLACEHOLDER}?utm_source=viber#top`,
    );
    expect(redactPathSecrets(`https://app.test/invite/${INVITE_TOKEN}/`)).toBe(
      `https://app.test/invite/${REDACTION_PLACEHOLDER}/`,
    );
  });

  test("leaves the bare route alone — `/invite` with nothing after it is not a credential", () => {
    for (const url of ["https://app.test/invite/", "/invite", "/invite/", ""]) {
      expect(redactPathSecrets(url)).toBe(url);
    }
  });

  test("returns a URL with nothing to redact byte for byte", () => {
    for (const url of ["https://app.test/dashboard", "/workspace/org-1/students?q=x"]) {
      expect(redactPathSecrets(url)).toBe(url);
    }
  });
});

describe("sanitizeAnalyticsProperties", () => {
  test("MV-194 — no URL property ships the invitation token, on any page of the session", () => {
    // $referrer and $session_entry_url are the ones that outlive the invite page: posthog
    // pins the session's entry URL to EVERY later event, so a student who lands on their
    // invitation link first would ship a live credential with every subsequent pageview.
    const sanitized = sanitizeAnalyticsProperties({
      $current_url: `https://app.test/invite/${INVITE_TOKEN}`,
      $referrer: `https://app.test/invite/${INVITE_TOKEN}`,
      $initial_current_url: `https://app.test/invite/${INVITE_TOKEN}`,
      $pathname: `/invite/${INVITE_TOKEN}`,
      $session_entry_url: `https://app.test/invite/${INVITE_TOKEN}`,
    });

    expect(JSON.stringify(sanitized)).not.toContain(INVITE_TOKEN);
  });

  test("MV-194 — a searched name and a token in one URL are BOTH cleaned", () => {
    // The two redactions compose rather than one replacing the other.
    const sanitized = sanitizeAnalyticsProperties({
      $current_url: `https://app.test/invite/${INVITE_TOKEN}?q=Placeholder`,
    });
    expect(sanitized.$current_url).toBe(
      `https://app.test/invite/${REDACTION_PLACEHOLDER}?q=${REDACTION_PLACEHOLDER}`,
    );
  });


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

  test("cleans $session_entry_url — the href pinned to EVERY event for the session's life", () => {
    // posthog-js attaches the session's entry URL to the properties of every
    // event until the session id rotates (30-minute idle, new tab, a shared
    // link). A counsellor whose session starts on a submitted search therefore
    // ships the student's name with every subsequent $pageview and $pageleave —
    // the same href posthog DOES scrub where it hands it over as
    // $set_once.$current_url.
    const sanitized = sanitizeAnalyticsProperties({
      $session_entry_url: `${STUDENTS}?q=Placeholder+Name`,
    });
    expect(sanitized.$session_entry_url).toBe(`${STUDENTS}?q=${REDACTION_PLACEHOLDER}`);
  });

  test("covers the whole $session_entry_ family by shape, not by an exact list of one", () => {
    // `getSessionProps` builds these keys by prefixing whatever set-once
    // property it holds, so the family grows without us. A rule narrowed back to
    // literal keys passes the test above and fails this one.
    const sanitized = sanitizeAnalyticsProperties({
      $session_entry_pathname: `/workspace/org-1/students?q=Placeholder`,
      $session_entry_referrer: `${STUDENTS}?q=Placeholder`,
      $session_entry_some_future_url: `${STUDENTS}?q=Placeholder`,
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
